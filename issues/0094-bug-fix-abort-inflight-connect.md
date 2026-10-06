# connect() のタイムアウトと disconnect() が進行中の接続処理を止めない

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-abort-inflight-connect
- Polished: {YYYY-MM-DD}

## 目的

`connect()` がタイムアウトまたは `disconnect()` で終わったあとも、進行中の接続処理が PeerConnection を残すか、`connect()` の Promise が決着しない状態をなくす。失敗した接続の監視タイマーが、直後の再接続の切断検知を壊さないようにする。

## 優先度根拠

High。単一のシグナリング URL で WebSocket の open が `connectionTimeout` より遅いと、呼び出し側は失敗を受け取るのにサーバセッションが残る。接続中に `disconnect()` すると `connect()` が戻らなくなる。どちらも利用者が回避できない。

`issues/closed/0011-bug-fix-monitor-signaling-ws-event-interval-orphan.md` は、`initializeConnection` の `clearConnectionTimeout` が interval も消すという前提でコード変更なしに closed になっている。現行の `clearConnectionTimeout` が消すのは接続タイムアウトの ID だけで、`monitorSignalingWebSocketEvent` の interval は残る。0011 がスコープ外とした race 構造そのものが本 issue の対象である。`issues/pending/0030-refactor-abend-shutdown-idempotency.md` は切断 4 系統の callback 冪等化であり、`connect()` の中断は扱わない。

## 現状

`ConnectionPublisher.connect` / `ConnectionSubscriber.connect` / `ConnectionMessaging.connect` は、各クラスの `multiStream` と `ConnectionBase.setConnectionTimeout` と `ConnectionBase.monitorSignalingWebSocketEvent` を `Promise.race` する。race は負けた側を止めない。`monitorWebSocketEvent` と `monitorPeerConnectionState` は race が成功したときだけ呼ばれる。

`setConnectionTimeout` は `this.pc` が無い、または `connectionState` が `"connected"` でないときに `signalingTerminate()` して reject する。`this.ws` への代入は `ConnectionBase.signaling` が type connect を送った後である。それより前の単一 URL の `getSignalingWebSocket` は `onopen` / `onclose` だけで、候補タイムアウトは無い。この区間でタイムアウトすると `signalingTerminate` は `this.ws === null` のためソケットを閉じない。その後 open すると `multiStream` は offer から `RTCPeerConnection` 生成まで進む。`connect()` はすでに reject 済みなので、切断と ICE `failed` の監視が付かない。

`monitorSignalingWebSocketEvent` は `this.ws` が無いあいだ return するだけで interval を消さない。`signalingTerminate` が呼ぶ `initializeConnection` も `clearConnectionTimeout` だけで、この interval は残る。再 `connect()` は同じフィールドに新しい interval ID を上書きする。古い interval が新しい `this.ws` を見ると `clearMonitorSignalingWebSocketEvent` で新しい interval を消し、`onclose` を「`signalingTerminate()` して、すでに終わった monitor 用 Promise を reject する」ハンドラに差し替える。`signalingTerminate` は `callbacks.disconnect` を呼ばない。

残っていた `multiStream` の `finally` は、インスタンスで共有している接続タイムアウトと監視 interval の ID を消す。失敗の直後にやり直した接続のタイマーが、先の接続の終了で外れる。

`disconnect()` は `this.ws` があるとき `onmessage` を外し、`onclose` をログ専用にする。`signaling` の Promise が終わるのは offer / redirect の resolve か、自分で付けた `onclose` の reject だけなので、差し替え後はどちらも起きない。続けて `initializeConnection` が接続タイムアウトも消す。`connect()` は `await this.signaling(ws)` のまま戻らない。

`onIceCandidate` は `event.candidate === null` か `iceConnectionState === "connected"` のときだけ resolve し、reject が無い。`this.pc` が null のときも Promise を宙吊りにする。`disconnect()` と `signalingTerminate` は待つ側を起こさずに `onicecandidate` を外す。ICE 待ちの途中で切断すると `connect()` は `await this.onIceCandidate()` から戻らない。

`setConnectionTimeout` のコールバックは `callbacks.timeout()` のあとで `signalingTerminate()` と reject する。この間に try が無い。利用者が渡した `timeout` コールバックが throw すると、時間切れでも切断も race の reject も走らない。

## 設計方針

接続試行ごとに世代を持たせ、タイムアウトと `disconnect()` はその世代を無効にする。無効になったあとの `await` 継続では `RTCPeerConnection` を作らず、開いた WebSocket を閉じる。`this.ws` にまだ入っていないローカルの WebSocket も閉じる。

`signaling` と `onIceCandidate` と `waitChangeConnectionStateConnected` は、世代が無効になったら reject する。`connect()` はタイムアウトと `disconnect()` のどちらでも必ず settle する。

`monitorSignalingWebSocketEvent` の interval は、`this.ws` が無い状態で接続試行が終わったら必ず止める。後から発火した古い interval は、新しい世代の `onclose` とタイマー ID を触らない。`multiStream` の `finally` は、自分の世代のタイマーだけを消す。

`callbacks.timeout()` が throw しても `signalingTerminate()` と race の reject は実行する。

`Promise.race` の敗者を止めない構造は残さない。接続の成否は 1 本の処理の完了で決める。

## 完了条件

- 単一 URL で WebSocket の open が `connectionTimeout` より遅いとき、`connect()` の reject 後にそのソケットが close され、その後 open しても `RTCPeerConnection` が作られない
- `connect()` が type connect 送信後、offer 受信前に `disconnect()` されたとき、`connect()` が reject する
- answer 送信後、ICE 完了前に `disconnect()` されたとき、`connect()` が reject する
- タイムアウトまたは `disconnect()` のあとで残っていた接続処理が、再 `connect()` の `onclose` と接続タイムアウトを消さない
- `timeout` コールバックが throw しても `signalingTerminate()` と `connect()` の reject が走る
- `callbacks.disconnect` を、タイムアウト側が二重に呼ばない
- モックは使わない。ブラウザの WebSocket をユニットテストで再現できない経路は、上記の制御フローがソース上で辿れることを完了条件にする
