# `disconnect()` が DataChannel 切断エラー時の abend event を normal で上書きする

- Priority: High
- Created: 2026-05-25
- Polished: 2026-06-08
- Completed: 2026-06-11
- Model: Composer 2.5
- Branch: feature/fix-disconnect-event-overwrite

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

### `src/base.ts` の修正

`disconnect()` 内の `signalingSwitched === true` 経路 (`src/base.ts:1122-1146`) を以下のとおり修正した。

- `result.code === 4999` のときは `event` を abend として通知する `if` 分岐に切り出し、normal による無条件上書きを停止した。`else` 分岐で従来どおり normal を生成する。
- abend event には `soraCloseEvent` の第 3 引数 `initDict` 経由で `code` と `reason` を付与した。これによりアプリ側が `event.code` / `event.reason` から原因 (`DisconnectWaitTimeoutError` / `DisconnectInternalError` / `DisconnectDataChannelError`) を判別できる。
- `title` (第 2 引数) には `result.reason` をそのまま渡す。本来 abend の `title` は `SoraAbendTitle` (`src/types.ts:498-505`) の体系だが、本 issue のスコープ外として `title` 統一は別 issue に委ねる。コメントでもその旨を明記している。
- lint ルール `unicorn/prefer-ternary` は意図的に `eslint-disable-next-line` で抑止した。本 issue の設計方針 (`if/else` 分岐化) と、各分岐に対応する詳細コメントを残すため、ternary より `if/else` の方が読みやすい。

### `e2e-tests/data_channel_signaling_only/` fixture の修正

- `index.html` に `#disconnect-event-type` / `#disconnect-event-reason` の `div` を追加した (初期値は空)。
- `main.ts` に以下を追加した。
  - URL クエリ `?disconnectWaitTimeout=...` を読み取って `ConnectionOptions.disconnectWaitTimeout` に流し込む。`"0"` を falsy で握り潰さないため `=== null` で明示判定している (lint ルール `no-negated-condition` 回避を兼ねた書き方)。
  - `SoraClient` の constructor に optional 引数 `disconnectWaitTimeout?: number` を追加し、constructor 内で `options` オブジェクトを組み立てるよう変更した。未指定時は SDK 既定値 (3000ms) に委ねる。
  - `connection.on("disconnect", this.onDisconnect.bind(this))` で disconnect callback を登録する。`onDisconnect` は `event.type` / `event.reason` を DOM に出力する。後続 issue (0002) で disconnect 回数を数える処理を追加する際には、本 handler 内に処理を統合する旨をコメントで明示した (handler 二重登録禁止)。

### `e2e-tests/tests/disconnect_event_type.test.ts` の追加

`?disconnectWaitTimeout=0` を渡して `Promise.race` を timeout 側に確実に倒し、switched 後の `disconnect()` を呼ぶと `event.type === "abend"` かつ `event.reason === "DISCONNECT-WAIT-TIMEOUT-ERROR"` になることを確認する E2E テストを追加した。

- バージョンチェックは本 fix のリグレッション検知を担保するため `majorVersion: 2026, minorVersion: 1` 以上で実行する。
- 938 経路 (`!this.soraDataChannels.signaling`) は `signalingSwitched === false` 側に該当し本 fix の修正範囲外、DC `onerror` 経路は AGENTS.md「モック・スタブ禁止」と整合する形で fixture 化できないため、テストファイル冒頭コメントでスコープを明示した。
- normal 経路 (4999 ではない `code: 1000` / `reason: "TYPE-DISCONNECT"`) の確認は別 issue (0002) で `#disconnect-count` を含めて追加する想定のため、本テストでは扱わない旨をコメントで明示した。
- 単体テスト (vitest) は `soraCloseEvent` が `private` のため追加できない旨も併記した。

### CHANGES.md の更新

`## develop` セクションの `[FIX]` ブロックに以下を追記した。

```
- [FIX] disconnect() で DataChannel 切断エラー (code 4999) 時に abend event が normal で上書きされないようにする
  - @voluntas
```
