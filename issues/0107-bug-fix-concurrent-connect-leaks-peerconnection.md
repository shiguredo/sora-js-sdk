# 同じ Connection への並行 connect() が先の WebSocket と PeerConnection を close() しない

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-concurrent-connect-leaks-peerconnection
- Polished: {YYYY-MM-DD}

## 目的

同じ `ConnectionPublisher` / `ConnectionSubscriber` / `ConnectionMessaging` で、前の `connect()` が終わる前に次の `connect()` を呼んでも、先に作った WebSocket と `RTCPeerConnection` を `close()` してから新しい接続だけを残す。

## 優先度根拠

Medium。接続中フラグは無い。`disconnectingPromise` は `disconnect()` の重なりだけをまとめる。二つの `connect()` が先頭の `disconnect()` を共有したあと、両方ともシグナリングを続ける。後から代入された `this.ws` と `this.pc` だけが残り、先のソケットと PeerConnection は SDK の参照から外れて `close()` されない。

進行中の 1 本をタイムアウトと `disconnect()` で止める問題は `issues/0094-bug-fix-abort-inflight-connect.md` である。本 issue は、止めたあとに 2 本目が同時に進む場合である。0094 の世代無効化と一緒に実装してよいが、観測するのは「同時に 2 本の接続処理が `this.pc` を作らない」ことである。

## 現状

各 `connect()` は `multiStream` の先頭で `await this.disconnect()` する。2 回目は 1 回目が作った `disconnectingPromise` を待つ。両方が `disconnect()` を抜けたあと、それぞれ `getSignalingWebSocket`、`signaling`、`connectPeerConnection` を実行する。`this.ws = ws` と `this.pc = new RTCPeerConnection` は、前のインスタンスを閉じない。

## 設計方針

接続処理は Connection につき 1 本にする。2 本目が始まるとき、1 本目の世代を無効にし、1 本目が持っている WebSocket と PeerConnection を `close()` する。2 本目だけが `this.ws` と `this.pc` を代入する。

1 本目の `connect()` は reject する。成功したように見えない。

## 完了条件

- 同じインスタンスで `connect()` を重ねたとき、先の WebSocket と `RTCPeerConnection` が `close()` される
- `this.pc` に残るのは後の接続だけである
- 先の `connect()` は reject する
- 1 本だけ呼んだ `connect()` の成功経路は変えない
