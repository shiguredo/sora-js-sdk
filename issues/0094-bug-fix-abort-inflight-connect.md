# connect() のタイムアウトと disconnect() が進行中の接続処理を止めない

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-abort-inflight-connect
- Polished: 2026-10-12

## 目的

`connect()` をタイムアウトまたは `disconnect()` で中断できるようにし、中断したあとに進行中の接続処理が PeerConnection を残す、または `connect()` の Promise が決着しない状態をなくす。失敗した接続の監視タイマーが、直後の再接続の切断検知を壊さないようにする。

## 優先度根拠

High。単一のシグナリング URL では WebSocket の open が `connectionTimeout` より遅くても時間切れせず、`connect()` がいつまでも決着しない (`connectionTimeout` は接続冒頭の `disconnect()` が消す。現状参照)。接続中に `disconnect()` すると `connect()` が戻らなくなる。どちらも利用者が回避できない。

`issues/closed/0011-bug-fix-monitor-signaling-ws-event-interval-orphan.md` は、`initializeConnection` の `clearConnectionTimeout` が interval も消すという前提でコード変更なしに closed になっている。現行の `clearConnectionTimeout` が消すのは接続タイムアウトの ID だけで、`monitorSignalingWebSocketEvent` の interval は残る。0011 がスコープ外とした race 構造そのものが本 issue の対象である。`issues/pending/0030-refactor-abend-shutdown-idempotency.md` は切断 4 系統の callback 冪等化であり、`connect()` の中断は扱わない。

## 現状

`ConnectionPublisher.connect` / `ConnectionSubscriber.connect` / `ConnectionMessaging.connect` は、各クラスの `multiStream` と `ConnectionBase.setConnectionTimeout` と `ConnectionBase.monitorSignalingWebSocketEvent` を `Promise.race` する。race は負けた側を止めない。`monitorWebSocketEvent` と `monitorPeerConnectionState` は race が成功したときだけ呼ばれる。

`setConnectionTimeout` は `this.pc` が無い、または `connectionState` が定義済みで `"connected"` でないときに `signalingTerminate()` して reject する。`this.ws` への代入は `ConnectionBase.signaling` が type connect を送った後である。それより前の単一 URL の `getSignalingWebSocket` は `onopen` / `onclose` だけで、候補タイムアウトは無い。ただしこのタイマーは既定設定では発火しない。`Promise.race` の配列は同期で評価されるため、`setConnectionTimeout` と `monitorSignalingWebSocketEvent` は、`multiStream` 冒頭の `await this.disconnect()` が完了する前に登録される。初回接続では `disconnectWebSocket` が `this.ws === null` で即 resolve し、続くマイクロタスクで `initializeConnection` の `clearConnectionTimeout` が、登録したばかりの接続タイムアウト ID を消す。旧 ws が残る再接続でも、既定の `disconnectWaitTimeout` (3000ms) が既定の `connectionTimeout` (60000ms) より短いため、タイマーは発火しない。

したがって既定設定では、単一 URL の open が遅い / 返らないあいだ `connect()` はどの race メンバも settle せず、いつまでも決着しない。open が後に実現して offer まで進めば接続自体は成功するため、この宙吊りから「reject 後にサーバセッションが残る」経路は生じない。旧 ws が残る再接続で `disconnectWaitTimeout` を `connectionTimeout` より長く設定した場合はタイマーが発火しうる。この場合 `signalingTerminate` は `this.ws === null` のため `getSignalingWebSocket` が作ったローカルの WebSocket を閉じず、その後 open すると `multiStream` は offer から `RTCPeerConnection` 生成まで進む。`connect()` はすでに reject 済みなので、切断と ICE `failed` の監視が付かない。

接続済みのまま `connect()` を呼び直した場合は、監視 interval の最初の tick が `disconnectWebSocket` が付けた旧 ws の `onclose` を差し替える。旧 ws の close が 100ms より遅ければ、その close が `connect()` を reject し、`disconnectWebSocket` の Promise は 3 秒後にようやく決着して `callbacks.disconnect` を発火する。reject 後に新しい接続処理は続行し、`RTCPeerConnection` が作られる。接続が成立しても切断時の監視 (`monitorWebSocketEvent` / `monitorPeerConnectionState`) は付かない。

`monitorSignalingWebSocketEvent` は `this.ws` が無いあいだ return するだけで interval を消さない。残るのは 1 回目の接続試行が `this.ws` の代入前に宙吊りになった場合である。`signalingTerminate` が呼ぶ `initializeConnection` も `clearConnectionTimeout` だけで、この interval は残る。再 `connect()` は同じフィールドに新しい interval ID を上書きする。古い interval が新しい `this.ws` を見ると `clearMonitorSignalingWebSocketEvent` で新しい interval を消し、`onclose` / `onerror` を「`signalingTerminate()` して宙吊りの 1 回目 monitor 用 Promise を reject する」ハンドラに差し替える。この reject が届くのは 1 回目接続の race だけで、新しい接続の race は WebSocket が閉じても settle しない。`signalingTerminate` は `callbacks.disconnect` を呼ばない。

残っていた `multiStream` の `finally` は、インスタンスで共有している接続タイムアウトと監視 interval の ID を消す。失敗の直後にやり直した接続のタイマーが、先の接続の終了で外れる。

`disconnect()` は `this.ws` があるとき `onmessage` / `onerror` を外し、`onclose` をログ専用にする。このとき `signaling` の Promise を settle させるのは offer / redirect の resolve と、例外・`ws.onclose` による reject だが、どれも差し替え後に発火しない。続けて `initializeConnection` が接続タイムアウトも消す。`connect()` は `await this.signaling(ws)` のまま戻らない。

一方 `signaling` が `createOffer` を待っているあいだは `this.ws` がまだ無く、`disconnect()` はハンドラを外せない。offer 生成後に処理は続行し、その後 offer が届くと `multiStream` は `RTCPeerConnection` を作る。利用者が `disconnect()` したあとに接続処理と配信が進みうる。

`onIceCandidate` は `event.candidate === null` か `iceConnectionState === "connected"` のときだけ resolve し、reject が無い。`this.pc` が null のときも Promise を宙吊りにする。`disconnect()` と `signalingTerminate` は待つ側を起こさずに `onicecandidate` を外す。ICE 待ちの途中で切断すると `connect()` は `await this.onIceCandidate()` から戻らない。

`setConnectionTimeout` のコールバックは `callbacks.timeout()` のあとで `signalingTerminate()` と reject する。この間に try が無い。利用者が渡した `timeout` コールバックが throw すると、時間切れでも切断も race の reject も走らない。

## 設計方針

接続試行ごとに世代を持たせ、タイムアウトと `disconnect()` はその世代を無効にする。無効になったあとの `await` 継続では `RTCPeerConnection` を作らず、開いた WebSocket を閉じる。`this.ws` にまだ入っていないローカルの WebSocket も閉じる。このため試行中の WebSocket は世代に紐付けて保持する。

現状の根本原因は、`multiStream` 冒頭の `await this.disconnect()` が完了する前に race がタイマーを登録し、その `disconnect()` 末尾の `initializeConnection` が `clearConnectionTimeout` で登録直後のタイマーを消すことにある。この接続冒頭の切断は前の状態の後始末であり、新しい接続試行の世代を無効化したり、新しい試行が登録した接続タイムアウトと監視 interval を消したりしてはならない。`disconnect()` の世代無効化は利用者による中断に限り、タイマー ID と監視 interval ID のクリアは接続試行の世代に紐付ける。

`signaling` と `onIceCandidate` と `waitChangeConnectionStateConnected` は、世代が無効になったら reject する。`connect()` はタイムアウトと `disconnect()` のどちらでも必ず settle する。

`monitorSignalingWebSocketEvent` の interval は、`this.ws` が無い状態で接続試行が終わったら必ず止める。後から発火した古い interval は、新しい世代の `onclose` とタイマー ID を触らない。`multiStream` の `finally` は、自分の世代のタイマーだけを消す。

`callbacks.timeout()` が throw しても `signalingTerminate()` と race の reject は実行する。

タイムアウト経路の終了は `signalingTerminate` 相当のクリーンアップと `connect()` の reject だけとし、`callbacks.disconnect` は発火しない。切断通知の発火元は 0030 が対象とする切断 4 系統に留める。

`Promise.race` の敗者を止めない構造は残さない。接続の成否は 1 本の処理の完了で決める。

## 完了条件

- 単一 URL で WebSocket の open が `connectionTimeout` より遅いとき、`connect()` が `connectionTimeout` で reject し、そのソケットが close され、その後 open しても `RTCPeerConnection` が作られない。接続冒頭の `disconnect()` がこの reject を妨げてはならない
- `connect()` が type connect 送信後、offer 受信前に `disconnect()` されたとき、`connect()` が reject する
- `connect()` が offer 生成 (`createOffer`) のあいだに `disconnect()` されたとき、`connect()` が reject し、その後 offer が届いても `RTCPeerConnection` を作らない
- answer 送信後、ICE 完了前に `disconnect()` されたとき、`connect()` が reject する
- タイムアウトまたは `disconnect()` のあとで残っていた接続処理が、再 `connect()` の `onclose` と接続タイムアウトを消さない
- `timeout` コールバックが throw しても `signalingTerminate()` と `connect()` の reject が走る
- タイムアウト経路は `callbacks.disconnect` を発火しない (発火は 0030 が対象とする切断 4 系統に任せる)
- モックは使わない。ブラウザの WebSocket をユニットテストで再現できない経路は、上記の制御フローがソース上で辿れることを完了条件にする
