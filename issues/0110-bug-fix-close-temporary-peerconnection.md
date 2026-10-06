# createOffer() が失敗すると一時 RTCPeerConnection が close() されない

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-close-temporary-peerconnection
- Polished: {YYYY-MM-DD}

## 目的

初期 SDP を作るための一時 `RTCPeerConnection` を、`createOffer()` が失敗したときも `close()` する。同じ失敗で、`getSignalingWebSocket` が返した WebSocket が `this.ws` に入る前に放置されないようにする。

## 優先度根拠

Medium。`ConnectionBase.createOffer` は `iceServers` が空の一時 PeerConnection を作り、`createOffer()` の成功後にだけ `close()` する。`createOffer()` が reject すると `close()` に到達しない。`finally` が無い。Safari とそれ以外の両方の分岐が同じ形である。この throw は `signaling()` がハンドラを付ける前なので、`multiStream` の try にも入らず、開いたシグナリング WebSocket も閉じられない。

## 現状

`ConnectionBase.signaling` は、WebSocket のハンドラを付ける Promise より前に `await this.createOffer()` する。`createOffer()` が throw すると、その Promise は作られない。`ConnectionPublisher` / `ConnectionSubscriber` / `ConnectionMessaging` の `multiStream` は `await this.signaling(ws)` を try の外で呼ぶ。try と `signalingTerminate()` は offer を受け取ったあとである。したがって `createOffer()` の失敗では、`getSignalingWebSocket` が返した WebSocket も閉じられない。この時点では `this.ws` にも入っていない。`getSignalingWebSocket` が付けた `onclose` は、すでに resolve した Promise を reject するだけで、`signalingTerminate()` は呼ばない。

一時 PeerConnection は `createOffer` のローカル変数であり、SDK の `this.pc` には入らない。Safari は `addTransceiver` のあと `createOffer()` する。それ以外は `offerToReceiveAudio` / `offerToReceiveVideo` を渡して `createOffer()` する。`pc.close()` はどちらの分岐でも `createOffer()` の成功後にしか無い。`addTransceiver` または `createOffer()` が throw すると `close()` に到達しない。成功時は `close()` してから timeline の `create-offer` を残して return する。

## 設計方針

`createOffer()` の成否に関係なく、関数を抜ける前に一時 PeerConnection を `close()` する。`addTransceiver` が throw した場合も同じである。成功時の戻り値と `create-offer` の timeline は維持する。失敗時は timeline に成功の `create-offer` を残さず、例外はそのまま伝播する。

`signaling()` は `createOffer()` が失敗したとき、引数の WebSocket を `close()` してから例外を伝播する。この `close()` では `signalingTerminate()` を呼ばない。ハンドラはまだ付いていない。

redirect のたびに `createOffer()` を再実行する件は `issues/0076-change-skip-create-offer-on-redirect.md` の範囲であり、本 issue では呼ばれる回数を変えない。

## 完了条件

- `RTCPeerConnection.createOffer()` が reject したとき、その一時インスタンスの `close()` が呼ばれる
- Safari 分岐で `addTransceiver` が throw したときも `close()` が呼ばれる
- Safari 分岐とそれ以外の分岐の両方である
- `createOffer()` が失敗したとき、`signaling()` に渡された WebSocket が `close()` される。その `onclose` は `signalingTerminate()` を呼ばない
- 成功時は従来どおり offer を返し、`close()` も呼ばれる
- 失敗時に `create-offer` の timeline は残らない
