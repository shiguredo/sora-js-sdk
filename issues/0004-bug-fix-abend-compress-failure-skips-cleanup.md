# `abend()` 中の `compressMessage` 失敗で disconnect 通知が Sora に届かず後続処理がスキップされる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-abend-compress-failure-cleanup

## 目的

`abend()` で DataChannel 経由の `type: disconnect` 送信を行う際の `await compressMessage(...)` が try/catch されておらず、圧縮失敗で例外が伝播すると `disconnectWebSocket` / `maybeClosePeerConnection` / `initializeConnection` / `callbacks.disconnect` がすべてスキップされる。ゾンビコネクション残存と disconnect 通知不発の同時発生を防ぐ。

## 優先度根拠

High。Sora 側にゾンビコネクションが残ったままユーザーには切断通知が来ない最悪パターン。再接続でセッション数上限に当たる運用事故を誘発する。

## 現状

`src/base.ts:750-810`

```ts
if (this.signalingOfferMessageDataChannels.signaling?.compress === true) {
  const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
  const compressedMessage = await compressMessage(binaryMessage);
  if (this.soraDataChannels.signaling.readyState === "open") {
    try {
      this.soraDataChannels.signaling.send(compressedMessage);
```

`await compressMessage(...)` 自体に try/catch がない。ブラウザのメモリ不足や `CompressionStream` の内部エラーで例外が出ると、`abend` の Promise が unhandled rejection になり、後続の `:803` `disconnectWebSocket(title)`、`:804` `maybeClosePeerConnection()`、`:805` `initializeConnection()`、`:812` `writeSoraTimelineLog` / `:814` `callbacks.disconnect(...)` がすべて未実行のまま終わる。

## 設計方針

`compressMessage` 失敗を catch しつつ、後続のクリーンアップに必ず到達させる構造に組み替える。`finally` を活用するか、send 部分を局所的に try/catch する。

## 完了条件

- `compressMessage` が失敗しても `disconnectWebSocket` / `maybeClosePeerConnection` / `initializeConnection` / `callbacks.disconnect` が必ず実行される
- 失敗時にも `writeSoraTimelineLog` で `abend-failed-to-compress` 相当のログが残る

## 解決方法

`abend()` 全体を構造分解し、DataChannel 経由送信部分を `sendDisconnectViaDataChannel(reason)` のような private メソッドに切り出して try/catch で囲む（issue 0026 のリファクタと連動）。最小修正としては:

```ts
try {
  const compressedMessage = await compressMessage(binaryMessage);
  if (this.soraDataChannels.signaling.readyState === "open") {
    try {
      this.soraDataChannels.signaling.send(compressedMessage);
    } catch (e) {
      this.writeDataChannelSignalingLog("failed-to-send-disconnect", ...);
    }
  }
} catch (e) {
  this.writeSoraTimelineLog("abend-failed-to-compress", { reason: String(e) });
}
```

または `abend()` 関数全体を `try { ... } finally { /* cleanup */ }` で包む。
