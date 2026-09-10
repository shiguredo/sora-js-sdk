# RTCPeerConnectionState failed 時の接続状態を Web Storage に保存して次回接続時に送信する

- Priority: Low
- Created: 2026-09-10
- Completed: {YYYY-MM-DD}
- Branch: feature/add-connection-failure-report
- Polished: {YYYY-MM-DD}

## 目的

Sora との接続が失敗したとき、その時点では WebSocket / DataChannel が切断済みか送信できない状態のことが多く、失敗の原因 (connectionState / iceConnectionState など) を Sora 側のログに残せない。失敗時の状態を Web Storage API に保存しておき、次回 `connect()` 時に Sora へ送信することで、接続失敗の原因を後から Sora 側のログで追えるようにする。

- <https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API>

## 優先度根拠

Low。接続の成否やアプリケーションの挙動には影響しない観測性 (診断情報) の問題であり、機能的なバグではない。ただし接続失敗の原因調査はクライアント側の状態が無いと難しく、保存と送信の仕組みがあると調査コストが下がるため、放置はしない。

## 現状

### 接続失敗の検知

`src/base.ts` の `monitorPeerConnectionState()` が `onconnectionstatechange` / `oniceconnectionstatechange` を監視し、以下の場合に切断する。

- `connectionState === "failed"` → `abendPeerConnectionState("CONNECTION-STATE-FAILED")`
- `iceConnectionState === "failed"` → `abendPeerConnectionState("ICE-CONNECTION-STATE-FAILED")`
- `iceConnectionState === "disconnected"` のまま 10000ms 経過 → `abendPeerConnectionState("ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT")`

WebSocket の onclose / onerror は `monitorWebSocketEvent()` から `abend("WEBSOCKET-ONCLOSE" / "WEBSOCKET-ONERROR")` を呼ぶ。

### 失敗時の状態は保存されない

`abendPeerConnectionState()` / `abend()` (`src/base.ts`) は `callbacks.disconnect()` と timeline ログ (`callbacks.timeline()`) を呼ぶだけで、失敗時の状態を永続化しない。アプリケーションは disconnect callback の `SoraCloseEvent` から title を受け取れるが、SDK を再読み込みすると情報は失われる。`src/` 配下に `localStorage` / `sessionStorage` を使うコードは無い (2026-09-10 時点)。

### Sora 側に接続状態を受け取る仕様が無い

`src/types.ts` の `SignalingConnectMessage` と `src/utils.ts` の `createSignalingMessage()` に、SDK が収集した接続失敗情報を送るフィールドは無い。Sora のシグナリング仕様にも `type: connect` でクライアントの接続失敗情報を受け取ってログに記録する仕組みは無い (Sora 2026.1.2 時点)。`metadata` / `signaling_notify_metadata` はアプリケーションが指定する値であり、SDK の診断情報を混ぜる用途には適さない。

## 設計方針

未確定。少なくとも以下を決める必要がある。

### 1. 保存する内容

`monitorPeerConnectionState()` の `onconnectionstatechange` が timeline ログに出している `connectionState` / `iceConnectionState` / `iceGatheringState` と、`abendPeerConnectionState()` の title、発生時刻、SDK バージョンを 1 レコードとして保存する案。`channel_id` / `client_id` など利用者が指定する値は、個人情報や機密情報が含まれうるため保存対象にするか要検討。

### 2. 保存先と保持期間

- `localStorage` と `sessionStorage` のどちらを使うか (タブを閉じても残すか)
- 同一 origin で複数のアプリ / SDK インスタンスが同居したときのキー設計と衝突回避
- 保存件数・サイズの上限と古いレコードの破棄
- Web Storage が利用できない環境 (プライベートモード・無効化・容量超過) で接続処理を壊さない方法

### 3. 送信方法

- 次回 `connect()` の `type: connect` に保存済みレコードを添付して送る案。Sora 側に受け取ってログに記録する仕様 (新しいフィールド) が必要
- 送信に成功したレコードをどう判定して削除するか、送信に失敗したときに残すか
- 保存した情報を送るかどうかを利用者が選べるようにするか

### 4. 保存しない情報

`metadata` / `signaling_notify_metadata` / `signaling_url` (JWT を含む) など、利用者や認証に関する情報は保存しない。保存するのは WebRTC の状態と SDK が生成する値に限定する。

## 完了条件

- Sora 側に接続失敗情報を受け取ってログに記録する仕様 (フィールド名・形式・ログ出力) が決まっていること
- SDK が接続失敗時に Web Storage API へ接続状態を保存すること
- 次回接続時に保存した接続状態を Sora へ送信できること
- Web Storage が利用できない環境でも接続処理が壊れないこと
- 保存する情報に個人情報・機密情報が含まれないこと
- 保存・送信・削除の挙動がテストで確認されていること
- `CHANGES.md` の `## develop` に変更を追記すること

## pending にした理由

- **Sora サーバー側の仕様が無い**: `type: connect` でクライアントの接続失敗情報を受け取ってログに記録する仕組みが Sora に無い (Sora 2026.1.2 時点)。SDK が情報を送っても Sora が記録できなければ、目的 (Sora 側のログでの原因追跡) を満たせない
- **SDK 側の設計が未確定**: 保存する項目・保存先 (`localStorage` / `sessionStorage`)・保持件数・送信タイミング・送信後の削除を決める必要がある
- **元 issue (shiguredo/sora-oss-private#1169) が 2023-11-15 に起票され、検証・不急のまま残っている**

着手判断のトリガー:

- Sora のシグナリング仕様に接続失敗情報 (または同等のクライアント診断情報) を受け取るフィールドが追加された
- SDK 側の保存内容・保存先・送信方法の方針が決まった
