# `onicecandidate` ハンドラが切断時に解除されず遅延 ICE candidate 通知で例外が起きる

- Priority: High
- Created: 2026-05-21
- Polished: 2026-06-08
- Model: Opus 4.7
- Branch: feature/fix-onicecandidate-not-cleared

## 目的

切断系メソッド `disconnect()` (`src/base.ts:1056-1061`)、`abend()` (`src/base.ts:719-724`)、`abendPeerConnectionState()` (`src/base.ts:608-613`)、`shutdown()` (`src/base.ts:671-676`) はいずれも pc の `ondatachannel` / `oniceconnectionstatechange` / `onicegatheringstatechange` / `onconnectionstatechange` の 4 ハンドラを null 化するが `onicecandidate` を残す。`signalingTerminate()` (`src/base.ts:582-598`) は pc ハンドラを一切 null 化しない。

切断処理の最中・完了後にローカル PeerConnection が Trickle ICE candidate を発火すると、`onicecandidate` ハンドラ (`src/base.ts:1536` で設定、async) が `await this.sendSignalingMessage(message)` (`src/base.ts:1553`) を呼ぶ。`sendSignalingMessage` (`src/base.ts:2301-2322`) は readyState チェックなしで送信し、DataChannel 経路なら CLOSING の `RTCDataChannel.send`、WebSocket 経路 (`this.ws !== null` 時) なら CLOSING/CLOSED の `this.ws.send` (`src/base.ts:2319`) が `InvalidStateError` を同期 throw する。`onicecandidate` は async なので throw は unhandled rejection になりグローバルエラーハンドラを叩く。切断系メソッドで `pc.onicecandidate = null` を呼んで発火経路自体を塞ぐ。

## 優先度根拠

High。Trickle ICE は切断タイミングと無関係に候補発見ごとに発火する。ICE gathering 完了前にユーザーが `disconnect()` を呼んだ場合、または ICE 状態遷移と切断処理がレースした場合に再現する。実害は unhandled rejection で、Sentry 等の外部監視にノイズを送り続ける。発火源は経路により DataChannel send か ws.send かが変わる (`sendSignalingMessage` は DataChannel 優先、`this.ws` が既に null の経路では DataChannel 経路のみ)。

## 現状

`src/base.ts:1536` で設定される `onicecandidate` ハンドラは async で、切断後も生存している。切断後に Trickle ICE candidate が発火すると `sendSignalingMessage` (`src/base.ts:2301-2322`) を呼び、readyState チェックなしで送信するため `InvalidStateError` が同期 throw され、async ハンドラのため unhandled rejection になる。

`src/base.ts` 全体で `this.pc.onicecandidate = null` はどこにも存在しない (設定は `:1536` のみ)。4 ハンドラ null 化ブロックは `disconnect()` 1056-1061 / `abend()` 719-724 / `abendPeerConnectionState()` 608-613 / `shutdown()` 671-676 にあるが、いずれも `onicecandidate` を含まない。`signalingTerminate()` は `this.pc.close()` (`:595`) のみ。

`sendSignalingMessage` の readyState チェック欠落 (= send 側の防御) は issue 0034 で扱う。

## 設計方針

`pc.close()` より前 (発火経路を確実に塞ぐため。close 後に残キューが flush される実装に備えた安全側) に `pc.onicecandidate = null` を追加する。

- **`disconnect()` / `abend()` / `abendPeerConnectionState()` / `shutdown()`:** 既存の 4 ハンドラ null 化ブロック (`if (this.pc) { ... }`) に `this.pc.onicecandidate = null;` を 1 行追加する。
- **`signalingTerminate()`:** 既存の `if (this.pc) { this.pc.close(); }` ブロック (`:594-596`) 内、`close()` の前に `this.pc.onicecandidate = null;` を追加する。本 issue のスコープは `onicecandidate` 解除のみとし、他 4 ハンドラは追加しない (`signalingTerminate` が pc ハンドラ全般を解除しない件は本 issue 対象外)。`signalingTerminate` の呼び出し元のうち `signaling()` の `ws.onclose` (`:1267`) は offer 受信前で `onicecandidate` 未設定だが、`monitorSignalingWebSocketEvent` の `ws.onclose` / `ws.onerror` (`:1606` / `:1612`) と `setConnectionTimeout` の timeout (`:1728`) は connect の `Promise.race` 中に走り、`onIceCandidate` (`publisher.ts:95` 等) が `onicecandidate` を設定した後に到達しうる。したがって signalingTerminate 経由でも本 issue の実害 (遅延 Trickle ICE → send → unhandled rejection) は現状で発生する経路であり、防御的追加ではない。

**設計限界:** `onicecandidate = null` は 2 件目以降の dispatch を止める。既に in-flight の `await sendSignalingMessage` は完走しうる (send 側 catch は 0034)。

## 完了条件

- `disconnect()`、`abend()`、`abendPeerConnectionState()`、`shutdown()`、`signalingTerminate()` の 5 経路に `this.pc.onicecandidate = null;` を追加する (いずれも `pc.close()` より前)
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- CHANGES.md `## develop` に次を追記する (既存 FIX 群の後ろ、担当者行は 2 文字インデント)
  ```
  - [FIX] 切断時に pc.onicecandidate が解除されず遅延発火する Trickle ICE 通知が send を呼んで unhandled rejection を起こしていたのを修正する
    - @voluntas
  ```

**検証の限界 (E2E は best-effort、主担保はコードレビュー):** `connect()` が resolve する時点では ICE gathering が完了し candidate 発火がほぼ止むため、`connect()` 後の `disconnect()` ではこのバグを決定論的に踏めない (gathering 進行中の切断レースが必要)。また fixture (`e2e-tests/sendrecv/main.ts`) の `client` はモジュールローカルで 1 接続専用 (`#connect` ごとに new) のため、同一接続で切断を繰り返す test は組めない。回帰の主担保はコードレビュー (5 経路に null 化が入っていることの確認) とする。`window.addEventListener("unhandledrejection", ...)` で件数を hidden DOM に出すフックを `main.ts` モジュール先頭に追加し件数を観測する best-effort E2E を残してもよいが、緑でも回帰を保証しない旨を PR 説明に明記する。

**0034 との関係:** 0034 は send 側 catch、0009 は発火源停止。0009 単独では in-flight の send は残り (→ 0034)、0034 単独では解除されないハンドラが close 後も発火しうる。二重防御であり相互に代替不可。

**マージ順:** `0021 → 0009 → 0001 → 0008 → 0007 → 0034 → 0030` (0004 正本チェーン参照。0009 自体は ConnectError 非依存だが正本に合わせ 0021 を先頭に記す)。
