# `disconnect()` が DataChannel 切断エラー時の abend event を normal で上書きする

- Priority: High
- Created: 2026-05-25
- Model: Composer 2.5
- Branch: feature/fix-disconnect-event-overwrite

## 目的

`disconnect()` の `signalingSwitched === true` 経路 (`src/base.ts:1076-1082`) で、`disconnectDataChannel()` が `code === 4999` を返したとき `event` を abend にセットした直後、無条件で `event = this.soraCloseEvent("normal", "DISCONNECT", result)` により上書きしている。DataChannel 切断エラーが normal disconnect としてアプリに通知される。

## 優先度根拠

High。0002 の disconnect 冪等化と独立に修正できる実バグ。エラー種別の誤通知はアプリ側の再接続判断・エラーハンドリングを誤らせる。0034 で `disconnectDataChannel` の compress 防御を入れても、timeout / DC onerror 経路の 4999 は残るため本 fix は依然必要。

## 現状

`src/base.ts:1076-1082`

```ts
if (this.signalingSwitched) {
  const result = await this.disconnectDataChannel();
  if (result.code === 4999) {
    // DataChannel の切断処理がエラーの場合は event を abend に差し替える
    event = this.soraCloseEvent("abend", result.reason);
  }
  event = this.soraCloseEvent("normal", "DISCONNECT", result);
```

`disconnectDataChannel()` が `{ code: 4999, ... }` を返す経路:

- `src/base.ts:938`: signaling DataChannel 不在 (`DisconnectInternalError`)
- `src/base.ts:1024-1027`: timeout (`DisconnectWaitTimeoutError`) / 強制 close / `DisconnectDataChannelError`

0002 完了条件で issue 0031 として登録済み。0002 の async IIFE 化後も **同一ロジックブロック内** を修正する。

### 再現条件 (E2E)

- fixture: `e2e-tests/data_channel_signaling_only/` (`ignoreDisconnectWebSocket: true`、`dataChannelSignaling: true`)
- connect → switched 後、`disconnectWaitTimeout: 0` で `disconnect()` を呼ぶ
- Sora 正常 close より timeout が先に勝ち、`result.code === 4999` になる
- 修正前: `callbacks.disconnect` の event.type が `normal`
- 修正後: event.type が `abend`

## 設計方針

0002 の冪等化ガードとは独立した分岐修正。`if/else` 化のみ。

修正後の期待 event 形状:

- `code === 4999`: `event.type === "abend"`、`event.title === result.reason`、`event.code === 4999`、`event.reason === result.reason`
- それ以外: `event.type === "normal"`、`event.title === "DISCONNECT"`、`event.code` / `event.reason` は `result` 由来

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

0002 マージ後は async IIFE 内の同一ブロックを修正する。

### E2E 変更

| ファイル                                           | 内容                                                  |
| -------------------------------------------------- | ----------------------------------------------------- |
| `e2e-tests/data_channel_signaling_only/index.html` | hidden DOM `#disconnect-event-type` (初期値空) を追加 |
| `e2e-tests/data_channel_signaling_only/main.ts`    | 下記を実装                                            |
| `e2e-tests/tests/disconnect_event_type.test.ts`    | 新規                                                  |

`main.ts`:

- `ConnectionOptions` に `disconnectWaitTimeout` を URL クエリ `?disconnectWaitTimeout=0` から読めるようにする (未指定時は SDK デフォルト 3000)
- `this.connection.on("disconnect", (event) => { ... })` で `#disconnect-event-type.textContent = event.type`
- 0002 マージ済みの場合、同一 handler 内で `#disconnect-count` increment と統合 (**handler 二重登録禁止**)

`disconnect_event_type.test.ts`:

- `data_channel_signaling_only?disconnectWaitTimeout=0` に遷移
- `checkSoraVersion` (2025.2.0+) は `switched_callback.test.ts` と同型
- connect → `#switched-status:not(:empty)` 待ち → `#disconnect` click
- `expect(page.locator("#disconnect-event-type")).toHaveText("abend", { timeout: 5000 })`

### マージ順

```
0004 → … → 0034 → 0031 → 0002 → 0030
```

0031 は **0002 より先** に単独 PR マージ可 (競合は 1076-1082 付近のみ)。0002 PR に 0031 を含めない。

## 完了条件

- `code === 4999` のとき normal で上書きしない (`else` 分岐化)
- abend event に `code` / `reason` が `initDict` 経由で入る
- `e2e-tests/data_channel_signaling_only/index.html` に `#disconnect-event-type` を追加する
- `main.ts` で disconnect event type を DOM に出し、`disconnectWaitTimeout: 0` をクエリから設定可能にする
- 新規 E2E で timeout 経路 (4999) 限定で event type が `abend` であることを assert する
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- CHANGES.md `## develop` に次のエントリを追記する

  ```
  - [FIX] disconnect() で DataChannel 切断エラー (code 4999) 時に abend event が normal で上書きされないようにする
    - @voluntas
  ```
