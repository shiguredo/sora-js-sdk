# `onicecandidate` ハンドラが切断時に解除されず `ws.send` で例外

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-onicecandidate-not-cleared

## 目的

`disconnect()` / `abend()` / `signalingTerminate()` のいずれも `this.pc.onicecandidate = null` を呼んでいない。切断中に Trickle ICE の遅延通知が発火し、CLOSING/CLOSED の WebSocket に対して `ws.send` を試みて同期 `InvalidStateError` を投げる。async ハンドラなので unhandled rejection になる。

## 優先度根拠

High。切断のたびに高確率で発生し、unhandled rejection がアプリ全体のグローバルエラーハンドラを叩く。

## 現状

`src/base.ts:1536-1558`

```ts
this.pc.onicecandidate = async (event): Promise<void> => {
  ...
  } else {
    ...
    await this.sendSignalingMessage(message);
  }
};
```

`sendSignalingMessage` (`:2301-2322`) は `ws.readyState` チェックなしで `this.ws.send(JSON.stringify(message))` を呼ぶ。

切断系メソッドのコード:

- `disconnect()` (`:1056-1061`) `this.pc.ondatachannel = null` 等は外すが `onicecandidate` は外していない
- `abend()` (`:716-815`) も同上
- `signalingTerminate()` (`:582-598`) も同上

## 設計方針

切断系メソッドで `pc.onicecandidate = null` を必ず呼ぶ。`sendSignalingMessage` で `ws.readyState !== 1` のとき early return する二重防御。

## 完了条件

- 切断中の Trickle ICE 通知で `InvalidStateError` が発生しなくなる
- unhandled rejection が発生しないことを E2E で確認

## 解決方法

切断系メソッド（`disconnect` / `abend` / `signalingTerminate`）の pc ハンドラ解除ブロックに `this.pc.onicecandidate = null;` を追加する。issue 0026 の切断系メソッド共通化リファクタで `detachPeerConnectionHandlers()` を作る際に統合する。

`sendSignalingMessage` 冒頭で:

```ts
if (!this.ws || this.ws.readyState !== 1) {
  return;
}
```
