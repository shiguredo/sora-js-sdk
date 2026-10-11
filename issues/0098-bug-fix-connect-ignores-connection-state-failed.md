# 初期接続が connectionState の failed を見ずに connectionTimeout まで待つ

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-connect-ignores-connection-state-failed
- Polished: 2026-10-12

## 目的

answer 送信後に `RTCPeerConnection.connectionState` または `iceConnectionState` が `"failed"` になったら、`connectionTimeout` を待たずに `connect()` を失敗させる。

## 優先度根拠

Medium。既定の `connectionTimeout` は 60000 ms である。ICE や DTLS がすでに失敗していても、`connect()` はその満了まで `"Signaling connection timeout"` として返る。`connectionTimeout` を 0 以下にするとタイマーが作られず、失敗したまま `connect()` が終わらない。

接続確立後の `failed` は `monitorPeerConnectionState` が `abendPeerConnectionState` する。本 issue は、その監視が付く前の初期接続だけを対象にする。

## 現状

`ConnectionBase.waitChangeConnectionStateConnected` が interval を止めるのは `this.pc` が null のときと `connectionState === "connected"` のときだけである。`"failed"` / `"disconnected"` / `"closed"` では 10 ms 間隔のまま待ち続ける。

`ConnectionBase.onIceCandidate` が resolve するのは `iceConnectionState === "connected"` か `event.candidate === null` のときだけである。`"failed"` では reject しない。

`connectionState` の `"failed"` を見る `monitorPeerConnectionState` は、`connect()` の `Promise.race` が成功したあとでしか設定されない。

`setConnectionTimeout` は `connectionTimeout > 0` のときだけタイマーを張る。0 以下では失敗を打ち切る経路が無い。

`publisher.ts` / `subscriber.ts` / `messaging.ts` の `multiStream` は offer 交渉中の例外で `signalingTerminate()` するが、`await this.waitChangeConnectionStateConnected()` はその `try` の外で呼ばれる。既存の失敗経路のクリーンアップはこの関数の reject には適用されない。

## 設計方針

初期接続中に `connectionState === "failed"` または `iceConnectionState === "failed"` になったら、その接続試行を失敗として終える。検出は `onIceCandidate` のハンドラか `waitChangeConnectionStateConnected` のどちらに置いてもよい。ただし `skipIceCandidateEvent` が true のときは `onIceCandidate` 自体が呼ばれないため、`waitChangeConnectionStateConnected` 側の検出が必須である。

失敗として終えるときは、`setConnectionTimeout` のタイムアウト経路と同様に `signalingTerminate` 相当のクリーンアップをしてから reject する。`waitChangeConnectionStateConnected` は `multiStream` の `try` の外で呼ばれ、既存の `catch` のクリーンアップが適用されないためである (publisher / subscriber / messaging 共通)。待ちの interval は止める。

初期接続中の `"failed"` は `connect()` の reject で終え、`callbacks.disconnect` は発火しない。切断通知の発火元は 0030 が対象とする切断 4 系統に留める。`monitorPeerConnectionState` を初期接続中に付けてはいけない。

reject のエラーは `"Signaling connection timeout"` と区別できるようにする (例: `ConnectError` の `reason` に `"CONNECTION-STATE-FAILED"` / `"ICE-CONNECTION-STATE-FAILED"` を使う)。`callbacks.timeout()` は発火しない。

成功した接続に付ける `monitorPeerConnectionState` の 10 秒 `disconnected` 判定は変えない。

`connectionTimeout <= 0` は「タイムアウト無し」のままにする。その場合でも `"failed"` では `connect()` が reject する。

空文字の ICE candidate の扱いは `issues/0112-bug-fix-firefox-empty-ice-candidate.md` で扱う。本 issue では終端判定の条件を変えない。

`connect()` の宙吊りとタイムアウト・`disconnect()` による中断は `issues/0094-bug-fix-abort-inflight-connect.md` が扱う。本 issue は初期接続中の `"failed"` 検出だけを担当し、同じ `onIceCandidate` / `waitChangeConnectionStateConnected` を変更する 0094 の中止条件は追加しない。

## 完了条件

- answer 送信後に `connectionState` が `"failed"` になると、`connectionTimeout` より前に `connect()` が reject する
- `iceConnectionState` が `"failed"` のときも同じである
- `skipIceCandidateEvent` が true でも、`"failed"` なら `connect()` が reject する
- `connectionTimeout` が 0 以下でも、`"failed"` なら `connect()` が reject する
- `"connected"` になるまで待つ既存の成功経路は維持する
- 接続確立後の `monitorPeerConnectionState` の切断条件は変えない
- `"failed"` で reject したあと、その接続試行の WebSocket と `RTCPeerConnection` が close され、再 `connect()` を妨げない
- 初期接続中の `"failed"` では `callbacks.disconnect` を発火しない
- reject は `"Signaling connection timeout"` と区別でき、`callbacks.timeout()` は発火しない
- モックは使わない。ICE の `"failed"` をユニットテストで再現できない経路は、上記の制御フローがソース上で辿れることを完了条件にする
