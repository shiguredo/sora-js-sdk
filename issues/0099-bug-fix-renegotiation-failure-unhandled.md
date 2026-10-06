# 接続後の re-offer 失敗が WebSocket では握りつぶされ DataChannel では未処理 rejection になる

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-renegotiation-failure-unhandled
- Polished: {YYYY-MM-DD}

## 目的

接続確立後の `type: re-offer` で `setRemoteDescription` または `createAnswer` が失敗したとき、未処理の rejection を出さず、PeerConnection の signaling state を失敗前に戻す。失敗を利用者の `connect()` には混ぜない。

## 優先度根拠

Medium。WebSocket 経路はログだけで戻り、映像は古いまま続く。DataChannel 経路は同じ失敗が async の `onmessage` から未処理 rejection になる。再交渉は接続中に track の増減で起きる。

`issues/closed/0068-bug-fix-cleanup-on-offer-negotiation-failure.md` は、接続確立後の re-offer 失敗で稼働中の接続を `signalingTerminate()` しない方針を明示している。本 issue はその方針を維持し、失敗の握りつぶしと未処理 rejection だけを直す。

## 現状

`ConnectionBase.signaling` の `onmessage` は、offer を resolve したあと (`settled === true`) の例外を `onmessage-exception-post-offer` のログだけで return する。このハンドラは `monitorWebSocketEvent` が `onmessage` を差し替えないため、接続後も残る。`signalingOnMessageTypeReOffer` の失敗はここへ入る。

DataChannel の signaling ラベルの `onmessage` は `await this.signalingOnMessageTypeReOffer(message)` を try 無しで呼ぶ。stats ラベルの `onmessage` も `sendStatsMessage` を try 無しで呼ぶ。notify / push / `#` / rpc の `onmessage` も `JSON.parse` と `parseDataChannelEventData` を try 無しで呼ぶ。

`signalingOnMessageTypeReOffer` は `setRemoteDescription`、`createAnswer`、`sendReAnswer` の順で、失敗時のロールバックが無い。

## 設計方針

DataChannel の各 `onmessage` で、パースと後続処理の失敗を捕捉する。未処理 rejection にしない。WebSocket の post-offer と同じく、稼働中の接続は `signalingTerminate()` しない。

`signalingOnMessageTypeReOffer` が `setRemoteDescription` のあとで失敗した場合は、signaling state を再交渉前に戻す。戻す手段がブラウザに無い状態なら、その時点の state を signaling ログに残し、次の re-offer を受けられる状態であることを完了条件で確認する。

失敗を新しいコールバックにはしない。コールバック追加は `issues/pending/0078-add-signaling-message-callbacks.md` の範囲である。

## 完了条件

- DataChannel の `onmessage` で `JSON.parse` または `signalingOnMessageTypeReOffer` が失敗しても未処理 rejection にならない
- 失敗しても `disconnect` コールバックは発火しない
- 失敗が signaling ログに残る
- 失敗後に次の re-offer を処理できる。`setRemoteDescription` が `InvalidStateError` で連続失敗しない
- 初回 offer の失敗で `connect()` を reject して `signalingTerminate()` する経路は変えない
