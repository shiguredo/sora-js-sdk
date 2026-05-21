# `monitorPeerConnectionState` の `iceConnectionState: disconnected` 10 秒タイマーが現代ブラウザで死んでいる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-monitor-ice-disconnected-timer

## 目的

`oniceconnectionstatechange` 内で `iceConnectionState === "disconnected"` の 10 秒タイマーを `this.pc.connectionState === undefined` の分岐内でしか起動していない。現代ブラウザはすべて `connectionState` を持つためこの分岐は常に false で、`disconnected` 検知が実質死んでいる。Wi-Fi 切替などで disconnect callback が永遠に発火しない不具合を修正する。

## 優先度根拠

High。Wi-Fi → 5G 切替などの日常的シナリオで「いつまでも disconnect callback が来ない」ハング状態になる。

## 現状

`src/base.ts:1664-1687`

```ts
this.pc.oniceconnectionstatechange = (_): void => {
  // connectionState が undefined の場合は iceConnectionState を見て判定する
  if (this.pc && this.pc.connectionState === undefined) {
    ...
    if (this.pc.iceConnectionState === "failed") {
      this.abendPeerConnectionState("ICE-CONNECTION-STATE-FAILED");
    }
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

Chrome / Firefox / Safari の現行版はすべて `connectionState` 定義済み。`onconnectionstatechange` 側 (`:1688-1702`) は `failed` のみ拾い、`disconnected` 滞留の検知ロジックがない。Firefox では `disconnected` 滞留が長く `failed` に遷移しないケースが頻発する。

## 設計方針

`connectionState === undefined` の if を外し、`iceConnectionState` 監視を常時有効化する。`onconnectionstatechange` 側にも `disconnected` 滞留タイマーを追加する。

## 完了条件

- 現代ブラウザで `iceConnectionState: disconnected` が 10 秒続いた場合に `abend("ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT")` が発火する
- Wi-Fi 切替などのネットワーク断シミュレーションで disconnect callback が発火する E2E を追加

## 解決方法

`oniceconnectionstatechange` の `if (this.pc && this.pc.connectionState === undefined)` ガードを外し、常に `iceConnectionState` を見て判定する。`failed` は `onconnectionstatechange` 側と重複するため、ハンドラ間で「先に発火した方が abend を実行する」よう abend 側の冪等化（issue 0002 の disconnect 冪等化と同方針）と組み合わせる。
