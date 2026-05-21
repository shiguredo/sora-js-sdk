# `sendAnswer` の `ws.send` 同期例外がアンキャッチで Promise リーク

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-send-answer-ws-send-exception

## 目的

`sendAnswer` / `sendUpdateAnswer` / `sendReAnswer` のいずれも `this.ws.send(JSON.stringify(message))` を try/catch せず同期呼び出ししている。`ws.readyState !== 1` のとき `InvalidStateError` が同期で投げられ、呼び元の `multiStream` が reject、`Promise.race` 敗者の interval / timeout がリークする。

## 優先度根拠

High。`createAnswer` 直後に Sora 側 TCP RST が来るシナリオで頻発する。さらに `signalingTerminate()` を経由しないため `this.ws` / `this.pc` が dangling 状態で残り、再接続でさらに状態破壊が連鎖する。

## 現状

`src/base.ts:1507-1515`

```ts
protected sendAnswer(): void {
  if (this.pc && this.ws && this.pc.localDescription) {
    ...
    this.ws.send(JSON.stringify(message));
  }
}
```

`ws.send` は `readyState !== 1` 時に同期 `InvalidStateError` を投げる。catch なし。`sendAnswer()` 自身は同期メソッドで、呼び元の `publisher.ts:93` 等では `await` されておらず、同期 throw がそのまま `multiStream` を reject させる。

`Promise.race` で `multiStream` が reject すると、`setConnectionTimeout` と `monitorSignalingWebSocketEvent` の敗者 Promise の interval / timeout が残り、後続の `connect()` で interval 孤児化を引き起こす（issue 0011 と相関）。

## 設計方針

`sendAnswer` / `sendUpdateAnswer` / `sendReAnswer` を try/catch で囲み、失敗時は `signalingTerminate()` を呼んでから throw し直す。可能なら `ws.readyState !== 1` の早期 return も追加する。

## 完了条件

- `ws.send` が同期 throw しても `signalingTerminate()` 経由で内部状態が正しく初期化される
- 例外発生時に `monitorSignalingWebSocketEvent` / `setConnectionTimeout` のタイマーがクリアされる

## 解決方法

```ts
protected sendAnswer(): void {
  if (this.pc && this.ws && this.pc.localDescription) {
    const message = { type: "answer", sdp: this.pc.localDescription.sdp };
    if (this.ws.readyState !== 1) {
      this.signalingTerminate();
      throw new Error("WebSocket is not open when sending answer");
    }
    try {
      this.ws.send(JSON.stringify(message));
    } catch (e) {
      this.signalingTerminate();
      throw e;
    }
  }
}
```

`sendUpdateAnswer` / `sendReAnswer` も同じパターンで修正する。
