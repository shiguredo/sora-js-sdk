# 接続後の re-offer 失敗が WebSocket では握りつぶされ DataChannel では未処理 rejection になる

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-renegotiation-failure-unhandled
- Polished: 2026-10-12

## 目的

接続確立後の `type: re-offer` で `setRemoteDescription` または `createAnswer` が失敗したとき、未処理の rejection を出さず、PeerConnection の signaling state を失敗前に戻す。失敗を利用者の `connect()` には混ぜない。

## 優先度根拠

Medium。WebSocket 経路はログだけで戻り、映像は古いまま続く。DataChannel 経路は同じ失敗が async の `onmessage` から未処理 rejection になる。再交渉は接続中に track の増減で起きる。

`issues/closed/0068-bug-fix-cleanup-on-offer-negotiation-failure.md` は、接続確立後の re-offer 失敗で稼働中の接続を `signalingTerminate()` しない方針を明示している。本 issue はその方針を維持し、失敗の握りつぶしと未処理 rejection だけを直す。

## 現状

`ConnectionBase.signaling` の `onmessage` は、offer を resolve したあと (`settled === true`) の例外を `onmessage-exception-post-offer` のログだけで return する。このハンドラは `monitorWebSocketEvent` が `onmessage` を差し替えないため、接続後も残る。`signalingOnMessageTypeReOffer` の失敗はここへ入る。

DataChannel の各ラベルの `onmessage` は try/catch 無し。signaling ラベルは `parseDataChannelEventData` と `JSON.parse` のあとに `await this.signalingOnMessageTypeReOffer(message)` (または `signalingOnMessageTypeClose(message)`)、stats ラベルは同じパースのあとに `await this.getStats()` と `await this.sendStatsMessage(stats)`、notify / push / rpc ラベルは同じパースのあとに `signalingOnMessageTypeNotify` / `callbacks.push` / `handleRPCResponse`、`#` ラベルはパースせず `decompressMessage` (compress のとき) のあとに `callbacks.message` を呼ぶ。`parseDataChannelEventData` と `decompressMessage` は reject しうるため、圧縮 DataChannel ではパース失敗も未処理 rejection になる。

`signalingOnMessageTypeReOffer` は `setRemoteDescription`、`createAnswer`、`sendReAnswer` の順で、失敗時のロールバックが無い。

## 設計方針

DataChannel の各 `onmessage` で、パースと後続処理の失敗を捕捉する。未処理 rejection にしない。捕捉後の DataChannel 経路の signaling / timeline ログ出力 (`writeDataChannelSignalingLog` 等) は `callbacks.signaling` / `callbacks.timeline` を呼ぶため、ユーザーコールバックの throw で失敗しうる。ログ出力自体の失敗も未処理 rejection にしない (ログ出力をさらに try で包む、または throw しない出力経路を使う)。WebSocket の post-offer と同じく、稼働中の接続は `signalingTerminate()` しない。

`signalingOnMessageTypeReOffer` は `setRemoteDescription` → `createAnswer` → `sendReAnswer` の順に進み、失敗時の signaling state は失敗した段階で異なる。`setRemoteDescription` の失敗時は RFC 9429 §5.10 の要求どおりエラー前の state に戻る (通常は `stable`)。`sendReAnswer` の失敗時も `stable` である。これらの state では `setLocalDescription({ type: "rollback" })` は `InvalidStateError` になるため、ロールバックは実行しない。`createAnswer` の失敗時は `have-remote-offer` のままであり (ローカル answer の適用失敗も RFC 9429 §5.9 でエラー前の state に戻る)、ロールバックが可能である。ロールバック可能なのは `have-local-offer` / `have-remote-offer` だけである (`stable` / `have-local-pranswer` / `have-remote-pranswer` では `InvalidStateError`)。`have-remote-offer` のままでも次の `setRemoteDescription(offer)` は受けられる (back-to-back offer)。ロールバックしない場合も、その時点の state を signaling ログに残し、次の re-offer を受けられる状態であることを完了条件で確認する。

失敗を新しいコールバックにはしない。コールバック追加は `issues/pending/0078-add-signaling-message-callbacks.md` の範囲である。

## 完了条件

- DataChannel の各 `onmessage` で、パース (`parseDataChannelEventData` / `decompressMessage` / `JSON.parse`) または後続処理 (`signalingOnMessageTypeReOffer` / `signalingOnMessageTypeClose` / `signalingOnMessageTypeNotify` / `getStats` / `sendStatsMessage` / `callbacks.push` / `callbacks.message` / `handleRPCResponse`) が失敗しても未処理 rejection にならない
- 失敗しても `disconnect` コールバックは発火しない
- 失敗が signaling ログに残る。ログ出力がユーザーコールバックの throw で失敗しても未処理 rejection にならない
- 失敗後に次の re-offer を処理できる。`setRemoteDescription` が `InvalidStateError` で連続失敗しない
- 初回 offer の失敗で `connect()` を reject して `signalingTerminate()` する経路は変えない
