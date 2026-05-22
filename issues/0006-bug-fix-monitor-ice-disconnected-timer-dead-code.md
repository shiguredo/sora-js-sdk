# `monitorPeerConnectionState` の `iceConnectionState: disconnected` 10 秒タイマーが現行ブラウザで動作しない

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-monitor-ice-disconnected-timer

## 目的

`monitorPeerConnectionState` (`src/base.ts:1660-1707`) 内の `oniceconnectionstatechange` (`src/base.ts:1664-1687`) で `iceConnectionState === "disconnected"` の 10 秒タイマー (`src/base.ts:1680-1684`) を `if (this.pc && this.pc.connectionState === undefined)` (`src/base.ts:1666`) のガード内でしか起動していない。`RTCPeerConnection.connectionState` は Chrome 72 (2019-01)、Firefox 113 (2023-05)、Safari 14.1 (2021-04) 以降で全て実装済みで、`README.md` 記載の sora-js-sdk 対応ブラウザ (Chrome / Edge 80+、Firefox 113+、Safari 16.4+) はすべて条件 `connectionState === undefined` を満たさない。したがってこの分岐は常に false で、`disconnected` 滞留検知が動作していない。`disconnected` から `failed` への遷移は WebRTC 仕様上「実装依存」となっており、ブラウザによっては `disconnected` のまま `failed` に遷移しないことがある (ブラウザ実装ごとの挙動差は本 issue では断定せず、観測タイムライン取得を完了条件に含めて確認する)。ガードを外して `disconnected` 滞留検知を常時動作させる。

## 優先度根拠

High。Wi-Fi / 5G 切り替えや一時的なネットワーク断後の状態遷移で `iceConnectionState` が `disconnected` のまま `failed` に遷移しない実装に当たると、`onconnectionstatechange` 側の `failed` 分岐 (`src/base.ts:1698-1700`) も走らないため、`callbacks.disconnect` が 1 度も発火せず接続失効を検知できない。SDK 利用者がアプリ側で ICE 状態を直接観測する手段が公開されていないため、迂回手段がない。

## 現状

`src/base.ts:1664-1687`

```ts
this.pc.oniceconnectionstatechange = (_): void => {
  // connectionState が undefined の場合は iceConnectionState を見て判定する
  if (this.pc && this.pc.connectionState === undefined) {
    this.writePeerConnectionTimelineLog("oniceconnectionstatechange", {
      connectionState: this.pc.connectionState,
      iceConnectionState: this.pc.iceConnectionState,
      iceGatheringState: this.pc.iceGatheringState,
    });
    this.trace("ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE", this.pc.iceConnectionState);
    clearTimeout(this.monitorIceConnectionStateChangeTimerId);
    // iceConnectionState "failed" で切断する
    if (this.pc.iceConnectionState === "failed") {
      this.abendPeerConnectionState("ICE-CONNECTION-STATE-FAILED");
    }
    // iceConnectionState "disconnected" になってから 10000ms の間変化がない場合切断する
    else if (this.pc.iceConnectionState === "disconnected") {
      this.monitorIceConnectionStateChangeTimerId = setTimeout(() => {
        if (this.pc?.iceConnectionState === "disconnected") {
          this.abendPeerConnectionState("ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT");
        }
      }, 10_000);
    }
  }
};
```

`connectionState === undefined` ガードは未対応ブラウザ向けのフォールバックとして導入された経緯がある (`src/base.ts:1665` のコメント参照)。現行サポートブラウザではこのガードが常に false となり、内部の `clearTimeout` / `failed` 検知 / `disconnected` 10 秒タイマーが一切動作しない。

`onconnectionstatechange` (`src/base.ts:1688-1702`) は `connectionState === "connected"` と `connectionState === "failed"` を拾うが、`disconnected` 滞留の検知ロジックを持たない。`onconnectionstatechange` 側に `disconnected` 滞留タイマーを追加するかどうかは別 issue として扱う (`connectionState === "disconnected"` の `failed` への遷移挙動を実機で計測してから判断する)。本 issue は `iceConnectionState` 側の検知復旧に絞る。

`clearMonitorIceConnectionStateChange` (`src/base.ts:1753-1755`) は `clearInterval(this.monitorIceConnectionStateChangeTimerId)` を呼んでいるが、`monitorIceConnectionStateChangeTimerId` に格納されているのは `setTimeout` (`src/base.ts:1680`) の戻り値。DOM 仕様上 timer ID プールは `setTimeout` / `setInterval` で共有されており実害は出ていないが API 名としては誤用。本 issue で `clearTimeout` に修正する。

## 完了条件

- `src/base.ts:1664-1687` の `oniceconnectionstatechange` から `if (this.pc && this.pc.connectionState === undefined)` ガードが削除され、`if (!this.pc) return;` の null ガードのみ残す。内部の `writePeerConnectionTimelineLog` / `trace` / `clearTimeout` / `failed` 分岐 / `disconnected` 10 秒タイマーが現行ブラウザで動作する
- `src/base.ts:1754` の `clearInterval` を `clearTimeout` に修正する
- ガード除去により `writePeerConnectionTimelineLog("oniceconnectionstatechange", ...)` が現行ブラウザでも出力されるようになる。タイムラインログの量が増える挙動変化を CHANGES.md / リリースノートに明記する
- E2E は Playwright の `page.context().setOffline(true)` で WebSocket / fetch を切るだけでは PeerConnection の ICE 経路 (UDP/TCP) が切れない可能性があり、決定論的な再現は難しい。手動検証手順を `e2e-tests/ice_disconnected/README.md` (新規) に「OS のネットワークインターフェイスを 10 秒以上 down にした際に `callbacks.disconnect` が `"ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT"` で発火することをログで確認」として残し、検証ログを PR 説明に添付する。Playwright での自動化は別 issue で扱う
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] iceConnectionState が disconnected で 10 秒経過した際の検知が現行ブラウザで動作していなかったのを修正する
    - @voluntas
  ```
- 本 issue は issue 0002 の完了条件で先行採番された `abendPeerConnectionState` 冪等化リファクタの issue とマージ順序の競合は無い (本 issue はガード削除のみで `abendPeerConnectionState` 自体には触らない)。ただし `iceConnectionState: failed` (1675-1677) と `connectionState: failed` (1698-1700) が同期に両方発火するケースでは `abendPeerConnectionState` が 2 回呼ばれて `callbacks.disconnect` が 2 回発火する既存の race が顕在化しやすくなる。本 issue では既存 race を悪化させない範囲に留め、抜本対応は `abendPeerConnectionState` 冪等化リファクタ issue で扱う

## 解決方法

`src/base.ts:1664-1687` を次の通り書き換える。

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
  // iceConnectionState "failed" で切断する
  if (this.pc.iceConnectionState === "failed") {
    this.abendPeerConnectionState("ICE-CONNECTION-STATE-FAILED");
  }
  // iceConnectionState "disconnected" になってから 10000ms の間変化がない場合切断する
  else if (this.pc.iceConnectionState === "disconnected") {
    this.monitorIceConnectionStateChangeTimerId = setTimeout(() => {
      if (this.pc?.iceConnectionState === "disconnected") {
        this.abendPeerConnectionState("ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT");
      }
    }, 10_000);
  }
};
```

`src/base.ts:1753-1755` を次の通り書き換える。

```ts
protected clearMonitorIceConnectionStateChange(): void {
  clearTimeout(this.monitorIceConnectionStateChangeTimerId);
}
```

`monitorIceConnectionStateChangeTimerId` の初期値は `0` (`src/base.ts:328`) で、`clearTimeout(0)` は仕様上 no-op のため安全。
