# 初期接続が connectionState の failed を見ずに connectionTimeout まで待つ

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-connect-ignores-connection-state-failed
- Polished: {YYYY-MM-DD}

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

## 設計方針

初期接続中に `connectionState === "failed"` または `iceConnectionState === "failed"` になったら、その接続試行を失敗として終える。待ちの interval は止める。成功した接続に付ける `monitorPeerConnectionState` の 10 秒 `disconnected` 判定は変えない。

`connectionTimeout <= 0` は「タイムアウト無し」のままにする。その場合でも `"failed"` では `connect()` が reject する。

空文字の ICE candidate の扱いは `issues/0112-bug-fix-firefox-empty-ice-candidate.md` で扱う。本 issue では終端判定の条件を変えない。

## 完了条件

- answer 送信後に `connectionState` が `"failed"` になると、`connectionTimeout` より前に `connect()` が reject する
- `iceConnectionState` が `"failed"` のときも同じである
- `connectionTimeout` が 0 以下でも、`"failed"` なら `connect()` が reject する
- `"connected"` になるまで待つ既存の成功経路は維持する
- 接続確立後の `monitorPeerConnectionState` の切断条件は変えない
