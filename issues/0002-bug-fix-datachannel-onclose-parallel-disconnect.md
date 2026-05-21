# DataChannel `onclose` で `disconnect()` が並列実行され callback 多重発火・状態破壊が起きる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-datachannel-onclose-parallel-disconnect

## 目的

各 DataChannel の `onclose` が独立に `await this.disconnect()` を呼ぶため、複数 DC が同時 close すると `disconnect()` が並列実行され、`callbacks.disconnect()` が多重発火する。内部状態の破壊もあり、アプリ側の再接続ロジックが多重起動する致命的バグを修正する。

## 優先度根拠

High。ネットワーク切断時に必ず複数 DC が同時 close するため、本番で頻発する。アプリ側で `disconnect` callback を起点に再接続を組んでいると無限再接続ループを生む。

## 現状

`src/base.ts:2144-2149`

```ts
dataChannelEvent.channel.onclose = async (event): Promise<void> => {
  const channel = event.currentTarget as RTCDataChannel;
  this.writeDataChannelTimelineLog("onclose", channel);
  this.trace("CLOSE DATA CHANNEL", channel.label);
  await this.disconnect();
};
```

`disconnect()` には reentrancy ガードが無い。PeerConnection close 時に `signaling` / `notify` / `push` / `stats` / rpc / `#xxx` の DC がほぼ同時に onclose を発火するため、`disconnect()` が N 並列で走る。

`disconnect()` 内では `await this.disconnectDataChannel()` (`:1077`) と `await this.disconnectWebSocket(...)` (`:1084, 1087`) があり、その間に別の `disconnect()` が `initializeConnection()` を実行して `this.soraDataChannels = {}`、`this.ws = null`、`this.pc = null` にする。後続の `disconnect()` は中途半端な状態で進むため `TypeError` を投げる経路がある。

加えて `callbacks.disconnect()` が複数回呼ばれるため、アプリ側で「disconnect 通知ごとに再接続」を組んでいると無限再接続ループになる。

## 優先度根拠

High。ネットワーク断のたびに発火する基本動作。

## 設計方針

`disconnect()` を冪等化する。1 回目の呼び出しが完了するまで 2 回目以降は最初の Promise を返す（メモ化 or `isDisconnecting` フラグ）。

## 完了条件

- 複数 DC の同時 close で `callbacks.disconnect()` が 1 回しか発火しない
- `disconnect()` を並列で呼んでも内部状態が破壊されない

## 解決方法

`ConnectionBase` に `private disconnectingPromise: Promise<void> | null` を持たせ、`disconnect()` の冒頭で:

```ts
if (this.disconnectingPromise) {
  return this.disconnectingPromise;
}
this.disconnectingPromise = (async () => {
  try {
    // 既存の disconnect 処理
  } finally {
    this.disconnectingPromise = null;
  }
})();
return this.disconnectingPromise;
```

`onclose` 内の `await this.disconnect()` はこのメモ化された Promise を待つだけになり、`callbacks.disconnect()` も 1 回しか発火しない。
