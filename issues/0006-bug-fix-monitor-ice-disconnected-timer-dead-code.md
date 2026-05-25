# `monitorPeerConnectionState` の `iceConnectionState: disconnected` 10 秒タイマーが現行ブラウザで動作しない

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-monitor-ice-disconnected-timer

## 目的

`monitorPeerConnectionState` (`src/base.ts:1660-1707`) 内の `oniceconnectionstatechange` (`src/base.ts:1664-1687`) で `iceConnectionState === "disconnected"` の 10 秒タイマー (`src/base.ts:1680-1684`) を `if (this.pc && this.pc.connectionState === undefined)` (`src/base.ts:1666`) のガード内でしか起動していない。`RTCPeerConnection.connectionState` は Chrome 72 (2019-01)、Firefox 113 (2023-05)、Safari 14.1 (2021-04) 以降で実装済みで、`README.md` 記載の sora-js-sdk 対応ブラウザ (Chrome / Edge 80+、Firefox 113+、Safari 16.4+) はすべて `connectionState === undefined` を満たさない。この分岐は常に false で、`disconnected` 滞留検知が動作していない。

`disconnected` から `failed` への遷移は WebRTC 仕様上実装依存であり、ブラウザによっては `disconnected` のまま `failed` に遷移しない。ガードを外して `disconnected` 滞留検知を現行ブラウザでも動作させる。

## 優先度根拠

High。Wi-Fi / 5G 切り替え等で `iceConnectionState` が `disconnected` のまま `failed` に遷移しない実装に当たると、`onconnectionstatechange` の `failed` 分岐 (`src/base.ts:1698-1700`) も走らず `callbacks.disconnect` が発火せず接続失効を検知できない。SDK 利用者が ICE 状態を直接観測する公開 API は無い。

**残余リスク (本 issue スコープ外):** `connectionState === "disconnected"` 滞留は未監視。ice 側復旧で大半をカバーする前提だが、ice が `connected` に戻り connectionState だけ `disconnected` のまま等は検知不能。

## 現状

`src/base.ts:1664-1687` — `connectionState === undefined` ガード内にのみ `clearTimeout` / `iceConnectionState === "failed"` / `disconnected` 10 秒タイマーがある。現行ブラウザではすべてデッドコード。

`onconnectionstatechange` (`src/base.ts:1688-1702`) は `connected` / `failed` のみ。

`clearMonitorIceConnectionStateChange` (`src/base.ts:1753-1755`) は `clearInterval` だが、格納 ID は `setTimeout` (`1680`) の戻り値。**`clearTimeout` に修正する** (0011 の connect リトライ中タイマー孤児化防止とも整合。0011 は `initializeConnection` での clear 追加が主因)。

## 設計方針

### 採用案 (ガード全体削除)

`connectionState === undefined` ガードを削除し、`if (!this.pc) return;` の null ガードのみ残す。1665 行コメントは削除または一般化する。

```ts
this.pc.oniceconnectionstatechange = (_): void => {
  if (!this.pc) {
    return;
  }
  this.writePeerConnectionTimelineLog("oniceconnectionstatechange", {
    connectionState: this.pc.connectionState,
    iceConnectionState: this.pc.iceConnectionState,
    iceGatheringState: this.pc.iceGatheringState,
  });
  this.trace("ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE", this.pc.iceConnectionState);
  clearTimeout(this.monitorIceConnectionStateChangeTimerId);
  if (this.pc.iceConnectionState === "failed") {
    this.abendPeerConnectionState("ICE-CONNECTION-STATE-FAILED");
  } else if (this.pc.iceConnectionState === "disconnected") {
    this.monitorIceConnectionStateChangeTimerId = setTimeout(() => {
      if (this.pc?.iceConnectionState === "disconnected") {
        this.abendPeerConnectionState("ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT");
      }
    }, 10_000);
  }
};
```

`clearMonitorIceConnectionStateChange`: `clearInterval` → `clearTimeout`。

**副作用 (0030 未マージ時):**

- 本 issue の目的: `disconnected` 10 秒タイマー再有効化
- 副作用: `iceConnectionState === "failed"` → `abendPeerConnectionState("ICE-CONNECTION-STATE-FAILED")` 再有効化 (現行はデッドコード)
- 副作用: `oniceconnectionstatechange` の timeline / trace ログ増加
- 0030 未マージ時、ICE failed では `oniceconnectionstatechange` (1675-1676) と `onconnectionstatechange` (1698-1699) がほぼ同時に走り **`callbacks.disconnect` 二重発火しうる**

**0030 同周期リリース必須。** 0006 単独マージ禁止。

### 代替案 (0030 待ちが長い場合)

`disconnected` タイマーと `clearTimeout` だけをガード外へ移し、`ice failed` 検知は `onconnectionstatechange` に一本化したままにする。0030 依存を緩和できる。採用案とどちらを取るかは PR 前に判断する。

### 0011 との関係

0006 適用後タイマーが実際に動き始める。`signalingTerminate` → `initializeConnection` は `clearMonitorIceConnectionStateChange` を呼ばない (`582-597`, `820-848`)。0011 の `initializeConnection` clear は孤児タイマー防止として有効。**マージ順 0006 → 0011**。

**変更対象:** `src/base.ts` の `monitorPeerConnectionState` / `clearMonitorIceConnectionStateChange`

## 完了条件

- 採用案または代替案どおり、`disconnected` 10 秒タイマーが現行ブラウザで動作する
- `clearMonitorIceConnectionStateChange` が `clearTimeout` を使う
- stale コメント (1665 行) を更新する
- **0030 と同一リリース周期でマージする** (0006 単独マージ禁止)
- 0030 マージ後、ICE failed 二重発火シナリオで timeline の `disconnect-abend` が 1 回のみであること (0030 側 E2E で担当)
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- 手動検証: `e2e-tests/ice_disconnected/README.md` (新規) に OS / ブラウザ、ネットワーク down 手順、期待 timeline (`ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT`) を記載 (Playwright 自動化はスコープ外)
- CHANGES.md `## develop` に次を追記する

  ```
  - [FIX] iceConnectionState が disconnected で 10 秒経過した際の検知が現行ブラウザで動作していなかったのを修正する
    - @voluntas
  ```

  副作用 (ICE failed 検知再有効化、timeline ログ増) を PR 説明または develop 追記で明記する。10 秒固定は一時的 `disconnected` でも切断される (CHANGES 旧記載 1000ms からの変更経緯は PR で触れる)。

**マージ順:** **0006 → 0011 → 0030** (0004 チェーン内では 0004 → 0006 → (0011) → … → 0030)

**検証の限界:** デッドコード修正の核心は CI 未カバー。手動 + 0030 側 ICE failed E2E で間接担保。
