# 同じ Connection への並行 connect() が先の WebSocket と PeerConnection を close() しない

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-concurrent-connect-leaks-peerconnection
- Polished: 2026-10-12

## 目的

同じ `ConnectionPublisher` / `ConnectionSubscriber` / `ConnectionMessaging` で、前の `connect()` が終わる前に次の `connect()` を呼んでも、先に作った WebSocket と `RTCPeerConnection` を `close()` してから新しい接続だけを残す。

## 優先度根拠

Medium。接続中フラグは無い。`disconnectingPromise` は `disconnect()` の重なりだけをまとめる。二つの `connect()` が先頭の `disconnect()` を共有したあと、両方ともシグナリングを続ける。この先の処理 (`setRemoteDescription`、`createAnswer`、`sendAnswer`、`onIceCandidate`、`waitChangeConnectionStateConnected`) は共有フィールドの `this.pc` / `this.ws` を参照するため、先の試行の後続処理が後の試行のリソースに作用し、後の接続を壊しかねない。後から代入された `this.ws` と `this.pc` だけが残り、先のソケットと `RTCPeerConnection` は SDK の参照から外れて `close()` されない。

進行中の 1 本をタイムアウトと `disconnect()` で止める問題は `issues/0094-bug-fix-abort-inflight-connect.md` である。本 issue は、1 本目が終わる前に 2 本目が始まり、両方が同時に進む場合である。0094 の世代無効化と一緒に実装してよいが、観測するのは「同時に 2 本の接続処理が `this.pc` を作らない」ことである。

## 現状

各 `connect()` は `multiStream` の先頭で `await this.disconnect()` する。2 回目は 1 回目が作った `disconnectingPromise` を待つ。両方が `disconnect()` を抜けたあと、それぞれ `getSignalingWebSocket`、`signaling`、`connectPeerConnection` を実行する。`this.ws = ws` と `this.pc = new window.RTCPeerConnection(...)` は、前のインスタンスを閉じない。

以後の処理は二つの試行が同じフィールドを共有したまま進む。`setRemoteDescription` と `createAnswer` は `this.pc`、`sendAnswer` は `this.pc` と `this.ws` を使い、`onIceCandidate` は `this.pc.onicecandidate` を上書きする。1 本目がこの代入を使うと、2 本目の `RTCPeerConnection` に `setRemoteDescription` が作用し、answer が 2 本目の WebSocket に送られうる。1 本目が `this.ws` を代入する前に 2 回目の `disconnect()` が走っても、1 本目がローカルに持つ WebSocket は閉じられず、両方がシグナリングを続ける。

## 設計方針

接続処理は Connection につき 1 本にする。2 本目が始まるとき、1 本目の世代を無効にし、1 本目が持っている WebSocket と PeerConnection を `close()` する。2 本目だけが `this.ws` と `this.pc` を代入する。

世代の無効化は 0094 の機構と共通でよい。2 本目冒頭の `disconnect()` が 1 本目の世代を無効にし、2 本目はその後で新しい世代を取得する。このため 0094 の「接続冒頭の切断は新しい接続試行の世代を無効化しない」は満たされる。2 本目の `connect()` は利用者による進行中の接続の中断とみなせる。

まだ決着していない 1 本目の `connect()` は reject する。成功したように見えない。reject の理由は 0094 の無効化経路と揃える。

無効化した試行の WebSocket を `close()` するときは、`signaling` が付けた `onclose` / `onmessage` を外してから閉じる。付けっぱなしだと、遅れて届く `onclose` が `signalingTerminate()` を呼び、2 本目が `this.ws` / `this.pc` に代入した接続を閉じてしまう。この close 経路は 0096 の完了条件 (`createSignalingMessage` の失敗 / `ws.send` の失敗 / `disconnectWebSocket`) に含まれない。

## 完了条件

- 同じインスタンスで `connect()` を重ねたとき、先の WebSocket と `RTCPeerConnection` が `close()` される (`this.ws` / `this.pc` に代入されていないローカルのものを含む)
- 1 本目の試行は、無効化されたあとの `await` 継続で `RTCPeerConnection` を作らない
- `this.ws` と `this.pc` に残るのは後の接続だけである
- まだ決着していない先の `connect()` は reject する
- 無効化した先の試行の WebSocket は、`onclose` / `onmessage` を外してから `close()` され、その後届くイベントは後の接続に作用しない
- 接続完了後に `disconnect()` してから再び `connect()` する順次再接続の経路は変えない
- 1 本だけ呼んだ `connect()` の成功経路は変えない
