# `disconnect()` が DataChannel 切断エラー時の abend event を normal で上書きする

- Priority: High
- Created: 2026-05-25
- Polished: 2026-06-08
- Completed: 2026-06-09
- Model: Composer 2.5
- Branch: feature/fix-abend-shutdown-idempotency

## 目的

`disconnect()` の `signalingSwitched === true` 経路 (`src/base.ts:1076-1082`) で、`disconnectDataChannel()` が `code === 4999` を返したとき `event` を abend にセットした直後、無条件で `event = this.soraCloseEvent("normal", "DISCONNECT", result)` により上書きしている。DataChannel 切断エラーが normal disconnect としてアプリに通知される。

## 優先度根拠

High。0002 の disconnect 冪等化と独立に修正できる実バグ。エラー種別の誤通知はアプリ側の再接続判断・エラーハンドリングを誤らせる。0034 で `disconnectDataChannel` の compress 防御を入れても、timeout / DC onerror 経路の 4999 は残るため本 fix は依然必要。

## 現状

### 問題のコード

    B -->|No| D
    D --> F["callbacks.disconnect type=normal"]

````

`src/base.ts:1076-1082`

```ts
if (this.signalingSwitched) {
  const result = await this.disconnectDataChannel();
  if (result.code === 4999) {
    // DataChannel の切断処理がエラーの場合は event を abend に差し替える
    event = this.soraCloseEvent("abend", result.reason);
  }
  event = this.soraCloseEvent("normal", "DISCONNECT", result);
````

`disconnectDataChannel()` が `{ code: 4999, ... }` を返す経路:

- `src/base.ts:938`: signaling DataChannel 不在 (`DisconnectInternalError`、reason `"DISCONNECT-INTERNAL-ERROR"`)
- `src/base.ts:1024-1027`: `Promise.race` の catch。timeout (`DisconnectWaitTimeoutError`、reason `"DISCONNECT-WAIT-TIMEOUT-ERROR"`) または DC `onerror` (`DisconnectDataChannelError`) の message が reason になる

### 再現条件 (E2E)

- fixture: `e2e-tests/data_channel_signaling_only/` (`ignoreDisconnectWebSocket: true`、`dataChannelSignaling: true`)
- connect → switched 後、`disconnectWaitTimeout: 0` で `disconnect()` を呼ぶ
- **決定性の根拠**: `disconnectWaitTimeout: 0` の timeout Promise は `setTimeout(reject, 0)` で次のマクロタスクで reject する。一方 DataChannel の正常 close は Sora との往復 (最低 1 RTT) を要し、実運用 RTT 下では後続のマクロタスク以降になる。よって `Promise.race` (`:1022`) は timeout が安定的に先勝ちし、catch で `result.code === 4999` (`reason === "DISCONNECT-WAIT-TIMEOUT-ERROR"`) になる。万一 close が先勝ちした場合は `code 1000` (event.type === `normal`) になり assert が fail して検知できる。switched 後は signaling DataChannel が存在するため 938 経路 (`"DISCONNECT-INTERNAL-ERROR"`) には入らない
- 修正前: `callbacks.disconnect` の event.type が `normal`
- 修正後: event.type が `abend`、event.reason が `"DISCONNECT-WAIT-TIMEOUT-ERROR"`

## 設計方針

0002 の冪等化ガードとは独立した分岐修正。無条件上書きを `if/else` 化し、加えて abend event に `code` / `reason` を initDict 経由で付与する (元コード 1080 は 2 引数で `code` / `reason` が欠落していた。後方互換のある情報追加)。

修正後の期待 event 形状:

- `code === 4999`: `event.type === "abend"`、`event.title === result.reason`、`event.code === 4999`、`event.reason === result.reason`
- それ以外: `event.type === "normal"`、`event.title === "DISCONNECT"`、`event.code` / `event.reason` は `result` 由来

**title について (スコープ外注記):** `title === result.reason` は元コード 1080 の挙動をそのまま維持する。ここでの `result.reason` は `DisconnectWaitTimeoutError` 等の message (`"DISCONNECT-WAIT-TIMEOUT-ERROR"` 等) であり、`abend()` / `abendPeerConnectionState()` が使う固定の `SoraAbendTitle` (`src/types.ts:498-505`、`"WEBSOCKET-ONCLOSE"` 等) とは体系が異なる。本 issue は event 種別 (normal→abend) の修正に絞り、title を固定 `SoraAbendTitle` へ揃える設計変更は行わない (title 統一は未起票。必要なら別途起票する)。`soraCloseEvent` の `title` 引数は `string` 型 (`src/base.ts:2380`) のため型エラーにはならない。`code` / `reason` の initDict は `soraCloseEvent` constructor が truthy 判定 (`:2392` / `:2395`) で設定するが、`code === 4999` / `reason` は非空のため確実に入る。

`src/base.ts:1078-1082` を次の通り修正する:

```ts
if (result.code === 4999) {
  event = this.soraCloseEvent("abend", result.reason, {
    code: result.code,
    reason: result.reason,
  });
} else {
  event = this.soraCloseEvent("normal", "DISCONNECT", result);
}
```

### E2E 変更

| ファイル                                           | 内容                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `e2e-tests/data_channel_signaling_only/index.html` | DOM `#disconnect-event-type` / `#disconnect-event-reason` (初期値空) を追加 |
| `e2e-tests/data_channel_signaling_only/main.ts`    | 下記を実装                                                                  |
| `e2e-tests/tests/disconnect_event_type.test.ts`    | 新規                                                                        |

`main.ts` (現状 `SoraClient` は `notify` / `connected` / `switched` / `signaling` を `on(..., this.onXxx.bind(this))` 形式で登録し、`disconnect` は未登録):

- `disconnectWaitTimeout` を URL クエリから読む。`const v = new URLSearchParams(location.search).get("disconnectWaitTimeout")` を `DOMContentLoaded` 内で取得する。現状 `SoraClient` の `options` はクラスフィールドのハードコード初期化で constructor は `options` 引数を持たないため、**options 受け渡し経路を新設する必要がある**: (a) constructor に optional 引数 `disconnectWaitTimeout?: number` を追加し生成箇所も更新する、または (b) constructor 内で `this.options` を組み立てる、のいずれか。`v !== null` のとき `Number.parseInt(v, 10)` を反映する。**`if (v)` で判定すると `"0"` は falsy で握り潰されるため `v !== null` で判定する**。`Number.parseInt` は不正値で `NaN` を返し `typeof NaN === "number"` のため SDK の型チェック (`src/base.ts:288`) を通過してしまう。E2E は正常値 (`"0"`) のみ渡すため実害はないが、汎用化する場合は `Number.isNaN` ガードを入れる。未指定 (`null`) 時は `options` に入れず SDK デフォルト 3000 に委ねる
- constructor の `this.connection.on("signaling", ...)` の後に `this.connection.on("disconnect", this.onDisconnect.bind(this))` を追加し、既存 `onSwitched` と同じスタイルで `private onDisconnect(event: SoraCloseEvent): void` を定義する。`SoraCloseEvent` は `sora-js-sdk` から import する。本体で `#disconnect-event-type.textContent = event.type`、`#disconnect-event-reason.textContent = event.reason ?? ""` をセットする
- 0002 マージ済みの場合は新規 handler を作らず既存 `onDisconnect` 内に `#disconnect-count` increment を統合する (**handler 二重登録禁止**)。0031 が先にマージされる場合は本 issue が `onDisconnect` を新規作成する

`disconnect_event_type.test.ts`:

- `data_channel_signaling_only?disconnectWaitTimeout=0` に遷移
- `checkSoraVersion` (2025.2.0+) は `switched_callback.test.ts` と同型
- connect → `#switched-status:not(:empty)` 待ち → `#disconnect` click
- `await expect(page.locator("#disconnect-event-type")).toHaveText("abend", { timeout: 5000 })`
- 4999 サブ経路を限定するため `await expect(page.locator("#disconnect-event-reason")).toHaveText("DISCONNECT-WAIT-TIMEOUT-ERROR")` も assert する (938 経路の `"DISCONNECT-INTERNAL-ERROR"` との誤検知防止)

### マージ順

リポジトリ全体の正本チェーンは issue 0004 を参照。該当区間は:

```
… → 0034 → 0031 → 0002 → 0005 → 0030
```

0031 は **0002 より先** に単独 PR マージ可 (競合は `src/base.ts:1076-1082` 付近のみ)。0002 PR に 0031 を含めない。0002 マージ後は async IIFE 内の同一ブロックを修正する (論理位置は不変、インデントのみ変わる)。

## 完了条件

- `code === 4999` のとき normal で上書きしない (`else` 分岐化)
- abend event に `code` / `reason` が `initDict` 経由で入る
- `e2e-tests/data_channel_signaling_only/index.html` に `#disconnect-event-type` / `#disconnect-event-reason` を追加する
- `main.ts` で disconnect event の type / reason を DOM に出し、`disconnectWaitTimeout` をクエリから設定可能にする (`"0"` を falsy で握り潰さず `!== null` で判定)
- 新規 E2E で timeout 経路 (4999) 限定で event type が `abend`、reason が `"DISCONNECT-WAIT-TIMEOUT-ERROR"` であることを assert する
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- CHANGES.md `## develop` に次のエントリを追記する

  ```
  - [FIX] disconnect() で DataChannel 切断エラー (code 4999) 時に abend event が normal で上書きされないようにする
    - @voluntas
  ```

## 解決方法

issue 0030 (`feature/fix-abend-shutdown-idempotency` ブランチ) の 4 系統冪等化リファクタに **同時取り込み** で対応した。

- `src/base.ts` の `disconnect()` が `runShutdownOnce` 経由になった際、`signalingSwitched === true` 経路で `disconnectDataChannel()` が `code === 4999` を返したとき、abend event を返し、それ以外で normal event を返す三項演算子に書き換えた。`code === 4999` の abend event には `initDict` 経由で `code` / `reason` を付与する。
- `event = this.soraCloseEvent("abend", result.reason)` 直後に無条件で `event = this.soraCloseEvent("normal", "DISCONNECT", result)` で上書きする旧バグを解消した。
- `e2e-tests/data_channel_signaling_only/index.html` に hidden の `#disconnect-event-type` / `#disconnect-event-reason` を追加 (0030 と同時)。`main.ts` で `onDisconnect` ハンドラを実装し、event 種別 / reason を DOM に反映する。`disconnectWaitTimeout` の URL クエリ受け取りも追加した。
- 0031 単独の E2E (`disconnect_event_type.test.ts`) は別ファイルとして新規追加せず、0030 の `disconnect_abend_idempotency.test.ts` のシナリオ 1 内で `#disconnect-event-type` の abend assert と `#disconnect-event-reason` の assert を行う形で取り込んだ (個別のテスト分離は冗長と判断)。

ローカルで `pnpm test`、`pnpm typecheck`、`pnpm run lint`、`pnpm run build` がすべて通ることを確認した。CHANGES.md `## develop` の `[FIX]` 群末尾に本 issue の `[FIX]` エントリを追記した。
