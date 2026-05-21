# redirect で旧 WebSocket の `onmessage` が null 化されず新接続の状態が破壊される

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-redirect-old-ws-onmessage

## 目的

`type: redirect` 受信時に旧 WebSocket のハンドラが完全に解除されておらず、close 直前にキューイングされていた `onmessage` が新接続後に発火して状態を破壊する経路を塞ぐ。`connected` callback が永遠に発火しない不具合の根本原因。

## 優先度根拠

High。redirect 経由のクラスター接続で本番発生しうる。`connected` callback が発火しないとアプリ側の接続完了処理がすべてスタックする。

## 現状

`src/base.ts:2064-2077`

```ts
private async signalingOnMessageTypeRedirect(
  message: SignalingRedirectMessage,
): Promise<SignalingOfferMessage> {
  if (this.ws) {
    this.ws.onclose = null;
    this.ws.onerror = null;
    this.ws.close();
    this.ws = null;
  }
  const ws = await this.getSignalingWebSocket(message.location);
  const signalingMessage = await this.signaling(ws, true);
  return signalingMessage;
}
```

`onclose` と `onerror` は null 化しているが、`onmessage` は null 化していない。`ws.close()` の前にキューイング済みの onmessage イベントは close 後も発火しうる。

旧 ws の onmessage は `signaling()` 内で設定された async ハンドラで、`this.connectedSignalingUrl` / `this.connectionId` を上書きする。これが新接続後に発火すると、`triggerConnectedCallbackIfReady` の `selfConnectionCreatedMessage` 比較 (`base.ts:2027` 周辺) が旧 ID と新 notify の `connection_id` を突き合わせる形になり、自分の `connection.created` notify と判定されず `connected` callback が永遠に発火しない。

## 設計方針

旧 ws を null 化する前に `onmessage` も null 化する。あわせて、後続のシグナリングメッセージが旧 ws 経由で届かないことを保証する。

## 完了条件

- `signalingOnMessageTypeRedirect` の冒頭で `this.ws.onmessage = null` が呼ばれている
- redirect 後の接続で `connected` callback が確実に発火することを E2E でカバーする

## 解決方法

`src/base.ts:2064-2077` の `if (this.ws) { ... }` ブロック内に `this.ws.onmessage = null;` を追加する。

```ts
if (this.ws) {
  this.ws.onclose = null;
  this.ws.onerror = null;
  this.ws.onmessage = null;
  this.ws.close();
  this.ws = null;
}
```

E2E に redirect 経路で `connected` callback 発火を検証するケースを追加する。
