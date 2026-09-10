# メッセージング用 DataChannel の open 前に `datachannel` コールバックが発火して `sendMessage` が失敗することがある

- Priority: Medium
- Created: 2026-09-10
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-datachannel-callback-before-open
- Polished: {YYYY-MM-DD}

## 目的

メッセージング用 DataChannel が実際に `open` になる前に `datachannel` コールバックが発火するため、コールバック内で `sendMessage` を呼ぶと `Messaging DataChannel is not open` で reject することがある。`datachannel` コールバックを DataChannel の `open` に紐づけ、コールバックを受け取った時点で対象 DataChannel が必ず送信可能であるようにする。

## 優先度根拠

Medium。WebSocket の `switched` メッセージと DataChannel の `open` は別トランスポートであり到着順序に保証がないため、タイミング次第で発生する。頻度は環境依存だが、メッセージング機能の基本的な使い方 (コールバックを受けてから送信する) が失敗しうる。利用者側で open になるまで待てば回避できるが、SDK 側で保証できる性質であり、`skills/sora-js-sdk/SKILL.md` の説明とも食い違っているため放置しない。

## 現状

### 発火経路

- `src/base.ts` の `onDataChannel` は `pc.ondatachannel` で受け取った `RTCDataChannel` を `soraDataChannels` に登録する。`ondatachannel` の時点で `readyState` は `"connecting"` であり、`"open"` になるのは `onopen` の発火後。
- `src/base.ts` の `signalingOnMessageTypeSwitched` は `this.datachannels` ゲッターの全要素について `callbacks.datachannel` を発火する。
- `src/base.ts` の `datachannels` ゲッターは `soraDataChannels` への登録有無だけを見て `readyState` を確認しない。

### 問題点

- `switched` の WebSocket メッセージが対象 DataChannel の `onopen` より先に到着すると、まだ `readyState` が `"open"` でない DataChannel について `datachannel` コールバックが発火する。コールバック内で `sendMessage` を呼ぶと `Messaging DataChannel is not open` で reject する。
- `switched` の時点でまだ `pc.ondatachannel` が発火していないチャンネルは `soraDataChannels` に存在しないため `datachannel` コールバックが一切発火しない (取りこぼし)。コールバックの網羅性が保証されない。
- WebSocket (`switched`) と DataChannel (`open`) は別トランスポートであり、到着順序に保証はない。
- `skills/sora-js-sdk/SKILL.md` は `datachannel` コールバックを「メッセージング用 DataChannel の open 時」と説明しており、実装の発火タイミングと一致していない。

### 再現手順

1. `Sora.connection(...).messaging(...)` で接続する
2. `connection.on("datachannel", ...)` を登録する
3. コールバック内で `connection.sendMessage(label, ...)` を呼ぶ
4. `switched` が対象 DataChannel の `onopen` より先に届くと `Messaging DataChannel is not open` で reject する

## 設計方針

- `datachannel` コールバックは「対象のメッセージング用 DataChannel が open になり送信可能になった時点」で 1 回だけ発火させる。
- 発火判定は `readyState === "open"` に紐づける。`switched` 受信時点で既に open のチャンネルはその場で発火し、まだ open でない / まだ `soraDataChannels` に登録されていないチャンネルは `onopen` をトリガーに発火する。
- 二重発火を防ぐため、`datachannel` コールバックを発火済みのラベルを `Set` で管理する。`initializeConnection()` でリセットする。
- メッセージング用 DataChannel の判定は `datachannels` ゲッターと同じ `signalingOfferMessageDataChannels` の `^#` ラベルを使う。
- 後方互換のため、`datachannel` コールバックは従来どおり `switched` 受信後にのみ発火する (`signalingSwitched` を gate に使う)。`datachannels` ゲッターの gate と揃える。
- `switched` / `connected` コールバックの発火タイミングと順序は変えない。
- `sendMessage` の「open でなければ throw する」契約は変えない。`datachannel` コールバックを受け取った後であれば必ず送信できる状態にする。
- `dataChannelSignaling` を使わない接続での `datachannels` / `datachannel` の扱いは本 issue のスコープ外とする (現状維持)。

## 完了条件

- `switched` 受信前に open したメッセージング用 DataChannel でも、`switched` 受信時に `datachannel` コールバックが 1 回発火する
- `switched` 受信後に open したメッセージング用 DataChannel では、`onopen` の時点で `datachannel` コールバックが 1 回発火する
- `datachannel` コールバックの発火時点で対象 DataChannel の `readyState` が `"open"` である
- 同一 DataChannel について `datachannel` コールバックが複数回発火しない
- `datachannel` コールバックの直後に `sendMessage` を呼んでも `Messaging DataChannel is not open` にならない
- `switched` / `connected` コールバックの既存の契約・順序が変わっていない
- E2E テスト `e2e-tests/messaging` で `datachannel` コールバック発火後に送信する経路を検証する。現状は `connection.created` notify で送信ボタンを有効化しており、その時点では DataChannel が open していない可能性がある
- ローカルで `vp test run` / `vp check` / `vp exec tsc --noEmit` が通る
- `CHANGES.md` の `## develop` 直下 (`### misc` より前) に `[FIX]` を追記する

  ```
  - [FIX] メッセージング用 DataChannel が open になる前に datachannel コールバックが発火し sendMessage が失敗することがあるのを修正する
    - @voluntas
  ```

テスト戦略: AGENTS.md の「モックやスタブは絶対に利用しないこと」、および jsdom に `RTCDataChannel` 実装がないことから、`ondatachannel` / `onopen` の順序を単体テストで決定的に再現できない。E2E テストで DataChannel の open を起点に送信する経路を追加して担保する。
