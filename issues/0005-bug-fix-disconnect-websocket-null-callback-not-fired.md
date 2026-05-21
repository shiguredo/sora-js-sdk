# `disconnectWebSocket` が `null` を返すと `disconnect` callback が永遠に発火しない

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-disconnect-websocket-null-callback

## 目的

`disconnect()` のうち `signalingSwitched === false` 経路で、`disconnectWebSocket` が `null` を返したとき `event = null` のままで `callbacks.disconnect()` が呼ばれない。「`await disconnect()` が成功して返ったのに `on('disconnect')` が一度も発火しない」という API 契約破壊を直す。

## 優先度根拠

High。利用者がアプリ側で「disconnect callback を起点にクリーンアップ」する設計を取れなくなる。

## 現状

`src/base.ts:1086-1094`

```ts
} else {
  const reason = await this.disconnectWebSocket("NO-ERROR");
  this.maybeClosePeerConnection();
  this.forceCloseDataChannels();
  if (reason !== null) {
    event = this.soraCloseEvent("normal", "DISCONNECT", reason);
  }
}
```

`disconnectWebSocket` (`:858-907`) は `this.ws.readyState !== 1` の経路で `resolve(null)` する（CONNECTING / CLOSING / CLOSED 状態）。`reason === null` になるため `event` は null のまま、その後の `:1096-1103` `if (event) { ... callbacks.disconnect(event) }` を素通り。

## 設計方針

`disconnectWebSocket` が null を返した場合でも、利用者には「正常切断」イベントを発火する。`reason` が null になる経路の意味（ws が既に閉じていた / 未確立だった）を `event.detail` に乗せて返す。

## 完了条件

- ユーザーが `await connection.disconnect()` を呼び終えたあと、`on('disconnect')` が必ず 1 回発火する
- ws の状態に関わらず（CONNECTING / OPEN / CLOSING / CLOSED）、disconnect callback が発火する

## 解決方法

`src/base.ts:1086-1094` を次のように変更:

```ts
} else {
  const reason = await this.disconnectWebSocket("NO-ERROR");
  this.maybeClosePeerConnection();
  this.forceCloseDataChannels();
  event = this.soraCloseEvent("normal", "DISCONNECT", reason ?? { code: 1000, reason: "NO-ERROR" });
}
```

`disconnectWebSocket` の null 戻りも正常切断として扱う。
