# offer 受信後の `setRemoteDescription` / `createAnswer` 失敗で ws / pc をクリーンアップしていない

- Priority: Medium
- Created: 2026-09-10
- Completed: 2026-09-10
- Model: Opus 4.7
- Branch: feature/fix-cleanup-on-offer-negotiation-failure
- Polished: 2026-09-10
- Reporter: @yuitowest

## 目的

受信側ブラウザが offer SDP を処理できない、または SDP が不正である場合などに `setRemoteDescription` / `createAnswer` が reject すると、`connect()` は reject するが SDK は WebSocket と PeerConnection の切断処理を行わない。その結果、Sora 側が `CONNECTION_WAIT_TIMEOUT` で ws を閉じるまでクライアントに ws / pc が接続済みのまま残る。接続失敗が確定した時点で ws / pc を明示的にクリーンアップする。

## 優先度根拠

Medium。`setRemoteDescription` / `createAnswer` が reject する条件 (ブラウザが offer SDP を処理できない、不正な SDP、交渉失敗など) が必要で毎回は発生しない。ただし発生時は Sora 側に不自然な `CONNECTION_WAIT_TIMEOUT` を誘発し、クライアントにも ws / pc が残る。既存の `sendAnswer` 失敗 (issue 0007 closed) と `signaling()` の `ws.onmessage` 例外 (issue 0008 closed) は個別にクリーンアップ済みで、その隣接経路の抜けを塞ぐ恒久対応。

## 現状

### 接続シーケンス

`ConnectionPublisher.connect` (`src/publisher.ts`) / `ConnectionSubscriber.connect` (`src/subscriber.ts`) / `ConnectionMessaging.connect` (`src/messaging.ts`) は `Promise.race` で `multiStream()` を待つ。`multiStream()` は次の順に処理する。

1. `await this.disconnect()`
2. `await this.getSignalingWebSocket(...)`
3. `await this.signaling(ws)` (offer の resolve)
4. `await this.connectPeerConnection(signalingMessage)` (pc 生成)
5. `await this.setRemoteDescription(signalingMessage)`
6. `await this.createAnswer(signalingMessage)`
7. `this.sendAnswer()`
8. `await this.onIceCandidate()` (`skipIceCandidateEvent` が false のとき)
9. `await this.waitChangeConnectionStateConnected()`

### 問題点

- `setRemoteDescription` (`src/base.ts`) は `this.pc.setRemoteDescription(sessionDescription)` を await するだけで、失敗時のクリーンアップを行わない。`createAnswer` (`src/base.ts`) も `pc.createAnswer` / `setLocalDescription` / simulcast 経路の `setSenderParameters` の失敗をそのまま伝播する。
- `multiStream().finally()` は `clearConnectionTimeout()` と `clearMonitorSignalingWebSocketEvent()` のみを呼び、`signalingTerminate()` を呼ばない。`multiStream()` の本体が `signalingTerminate()` を呼ぶのは `sendAnswer()` の失敗経路だけである (`signalingTerminate()` 自体は `signaling()` の pre-offer reject / `ws.onclose`、`monitorSignalingWebSocketEvent` の `ws.onclose` / `ws.onerror`、`setConnectionTimeout` のタイムアウトからも呼ばれる)。
- そのため 5 / 6 の失敗では `this.ws` / `this.pc` が残り、`initializeConnection()` も呼ばれない (`this.soraDataChannels` は初期接続のこの段階では通常まだ生成されていない)。`signaling()` で `connectionId` / `clientId` / `bundleId` 等はすでに offer から設定されているため、それらも残る。
- `monitorSignalingWebSocketEvent` が `ws.onclose` に設定した切断ハンドラが残っていれば、最終的に Sora 主導の `CONNECTION_WAIT_TIMEOUT` クローズで `signalingTerminate()` が走る。この「サーバのタイムアウト待ち」が不自然であり、本 issue で解消する。

補足: reject 後にユーザーが再度 `connect()` を呼ぶと、各 `multiStream()` 先頭の `disconnect()` が残骸を掃除するため実害は軽減される。ただし最初の失敗直後に残る ws / pc と Sora 側のタイムアウトは解消しない。

## 設計方針

`setRemoteDescription` / `createAnswer` は初回接続 (offer) だけでなく `signalingOnMessageTypeUpdate` / `signalingOnMessageTypeReOffer` からも呼ばれる。接続確立後の update / re-offer 失敗は既存の post-offer 例外方針 (`ws.onmessage` の catch でログのみ、稼働中接続を壊さない) の対象であり、本 issue のスコープ外とする。したがってクリーンアップは共有メソッドである `setRemoteDescription` の中ではなく、初回接続経路である各サブクラスの `multiStream()` の post-offer 区間 (3 の `signaling()` resolve 直後〜8 の `onIceCandidate()` 完了まで) に置く。

- `multiStream()` の 4 (`connectPeerConnection()`) から 8 (`onIceCandidate()`) までを try/catch で包み、catch で `signalingTerminate()` を呼んでから元の例外を reject する。`connectPeerConnection()` も `new RTCPeerConnection()` の失敗で throw しうるため区間に含める。
- 9 (`waitChangeConnectionStateConnected()`) は区間に含めない。このメソッドが reject するのは `this.pc` が falsy になった場合だけであり、それは `disconnect()` / `signalingTerminate()` / `abendPeerConnectionState()` のいずれかで pc が既に破棄されたことを意味する。ここで `signalingTerminate()` を呼んでも新たに救う対象はなく、多重 `connect()` の競合時に後続接続の ws / pc を閉じてしまうリスクだけがある。
- `signalingTerminate()` は `src/base.ts` の private のため、サブクラスから呼べるよう `protected` に変更する。可視性の変更だけで処理内容は変えない。
- `sendAnswer()` は自身の失敗経路で `signalingTerminate()` を呼んだうえで throw する。`multiStream()` 側の catch でも再度呼ばれるが、`signalingTerminate()` は `ws` / `pc` / DataChannel を null/falsy ガード付きで閉じ `initializeConnection()` を呼ぶ冪等な処理なので問題ない。
- `signalingTerminate()` は末尾で `initializeConnection()` を呼ぶため、reject 直後に観測される内部状態 (`ws` / `pc` / `connectionId` / `clientId` / `bundleId` / `soraDataChannels` 等) が一貫して初期化される。
- 呼び出し元へ渡す例外は元のものをそのまま reject する。`signaling()` 内で完結している `ConnectError` ラップを二重にラップしない。
- `signalingTerminate()` が `ws.onmessage` / `ws.onerror` を解除しない問題は issue 0043 (pending) のスコープであり、本 issue では扱わない。

## 完了条件

- post-offer の `setRemoteDescription` / `createAnswer` 失敗時に `signalingTerminate()` が呼ばれ、`this.ws` / `this.pc` / `this.soraDataChannels` がクリーンアップされる
- `connect()` が reject する契約は変えない (reject する例外も従来どおり)
- publisher / subscriber / messaging の 3 経路すべてで同様にクリーンアップされる
- ローカルで `vp test run` / `vp run e2e-test` が通る
- `vp exec tsc --noEmit` / `vp check` が通る
- CHANGES.md の `## develop` 直下 (`### misc` より前) に `[FIX]` エントリを追記する (担当者行は 2 文字インデント)

  ```
  - [FIX] 初回接続の offer 交渉中に setRemoteDescription / createAnswer が失敗したときに ws / pc がクリーンアップされなかったのを修正する
    - @voluntas
  ```

- 実ブラウザで再現できる場合は手動検証手順を PR 説明に記載する

テスト戦略: AGENTS.md の「モックやスタブは絶対に利用しないこと」および jsdom に `RTCPeerConnection` 実装がない都合上、`setRemoteDescription` / `createAnswer` の reject を単体テストで決定的に再現できない。post-offer 例外時のクリーンアップを直接検知できる新規の timeline / signaling ログを導入しない限り自動化は困難なため、実装時は E2E での再現可否を確認し、不可なら手動検証で担保する。

## 解決方法

`signalingTerminate()` を `protected` に変更し、publisher / subscriber / messaging の各 `multiStream()` で offer 受信後の `connectPeerConnection()` から `onIceCandidate()` までを try/catch で包んだ。失敗時は `signalingTerminate()` で ws / pc / DataChannel をクリーンアップしてから例外を再 throw する。`waitChangeConnectionStateConnected()` は設計どおり区間に含めず、既存の挙動を維持する。

- `src/base.ts`: `signalingTerminate()` を `private` から `protected` に変更 (処理内容は不変)
- `src/publisher.ts` / `src/subscriber.ts` / `src/messaging.ts`: `multiStream()` の post-offer 区間に try/catch を追加し、失敗時に `signalingTerminate()` を呼んでから rethrow
- `CHANGES.md`: `## develop` 直下 (`### misc` より前) に `[FIX]` を追記

検証: `vp check` / `vp exec tsc --noEmit` / `vp test run` (109 tests pass) / `vp pack` がすべて成功。`setRemoteDescription` の reject を決定的に再現する自動テストは AGENTS.md のモック禁止と jsdom に `RTCPeerConnection` がない制約により追加していない (E2E での再現は未確認で、手動検証の対象)。
