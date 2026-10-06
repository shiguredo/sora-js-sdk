# すでに閉じた DataChannel の onclose から disconnect() すると切断待ちが必ずタイムアウトする

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-datachannel-onclose-disconnect-timeout
- Polished: {YYYY-MM-DD}

## 目的

`disconnectDataChannel` が、すでに `readyState === "closed"` の DataChannel に新しい `onclose` を付けて再発火を待たないようにする。切断が `disconnectWaitTimeout` の abend に必ずならないようにする。

## 優先度根拠

Medium。シグナリングを DataChannel へ切り替えたあと、type `close` を伴わずにチャネルが閉じると、利用者は既定 3000 ms 待ったあと type `"abend"`、title `"DISCONNECT-WAIT-TIMEOUT-ERROR"` を受け取る。ローカルの PeerConnection は `forceCloseDataChannels` で閉じるので残りはしない。通知の種別が正常切断にならない。利用者が `disconnect()` したときも、Map に `"closed"` のチャネルが残っていれば同じ待ちになる。全チャネルが `"open"` の呼び出しは、この待ちが必ずタイムアウトする経路には入らない。

## 現状

`ConnectionBase.onDataChannel` はすべての DataChannel の `onclose` で `disconnect()` を呼ぶ。`signalingSwitched === true` のとき、`disconnect()` は `disconnectDataChannel` に入る。

`disconnectDataChannel` は `readyState` を見ずに、Map 内の全チャネルに新しい `onclose` を付け、`Promise.all` で全員の発火を待つ。`onclose` ハンドラが走った時点のチャネルはすでに `"closed"` であり、付け直した `onclose` は再発火しない。他のチャネルが閉じても、閉じ済みの 1 本が `Promise.all` を止める。`disconnectWaitTimeout` のあと `DisconnectWaitTimeoutError` になり、code `4999` の abend として `callbacks.disconnect` が呼ばれる。

これは `onclose` 起点に限らない。利用者が `disconnect()` したときも、Map に `"closed"` のチャネルが残っていれば同じ待ちになる。全チャネルが `"open"` のままの呼び出しは、閉じる前に新しい `onclose` が付くので、リモートが閉じれば待ちは解ける。

type `close` メッセージは `shutdown()` が先にログ専用の `onclose` へ差し替えるため、この待ちには入らない。

## 設計方針

`disconnectDataChannel` を始める時点で `readyState === "closed"` のチャネルは、待ちの対象にしない。まだ開いているチャネルだけ新しい `onclose` を待ち、それらを `close()` する。

すでに全部閉じているなら、タイムアウトを待たずに正常切断として終える。`onerror` で `DisconnectDataChannelError` になる経路は維持する。

`onclose` が接続全体の `disconnect()` を呼ぶこと自体は、本 issue では変えない。

## 完了条件

- switched 後に 1 本の DataChannel が type `close` 無しで閉じたとき、`disconnect()` が `disconnectWaitTimeout` まで待たない
- そのときの `disconnect` イベントが code `4999` の abend にならない
- Map に `"closed"` のチャネルが残った状態で利用者が `disconnect()` したときも、そのチャネルの再発火は待たない
- 全チャネルが `"open"` の状態で利用者が `disconnect()` したときは、従来どおり close を待って正常切断になる
- `onerror` による `DisconnectDataChannelError` は維持する
