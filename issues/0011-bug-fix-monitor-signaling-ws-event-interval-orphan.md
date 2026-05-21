# `monitorSignalingWebSocketEvent` の interval が `connect()` 連続呼び出しで孤児化する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-monitor-signaling-ws-interval-orphan

## 目的

1 回目の `connect()` が race で敗者になった後、ユーザーがすぐに 2 回目 `connect()` を呼ぶと、`initializeConnection` で `clearMonitorSignalingWebSocketEvent` が呼ばれないため 1 回目の interval が孤児化する。2 回目で `this.monitorSignalingWebSocketEventTimerId` が上書きされ、孤児化した 1 回目 interval が新 ws のハンドラを破壊する。

既存の C-5（`abend` 経路の leak）とは別経路の致命的問題。

## 優先度根拠

High。ユーザーが「失敗 → リトライ」を実装した場合に高確率で発火する。リトライした 2 回目の `connect()` が誤った abend 処理で失敗するため、リトライ機能そのものが壊れる。

## 現状

`src/base.ts:1592-1617` の `monitorSignalingWebSocketEvent` と `publisher.ts:23-30` / `subscriber.ts:19-26` / `messaging.ts:22-29` の `Promise.race` 構造。

`initializeConnection` (`:820-848`) には `clearMonitorSignalingWebSocketEvent` の呼び出しが存在しない。`setConnectionTimeout` (`:1712-1734`) も冒頭で前回 timerId を clear しない。

## 設計方針

`initializeConnection` 内で `clearMonitorSignalingWebSocketEvent` と `clearConnectionTimeout` を必ず呼ぶ。`setConnectionTimeout` / `monitorSignalingWebSocketEvent` の冒頭で前回タイマーを明示的にクリアする二重防御。

## 完了条件

- `connect()` を連続で 2 回呼んでも interval / timeout が孤児化しない
- 2 回目の `connect()` が 1 回目の interval に状態を破壊されない

## 解決方法

`initializeConnection` の末尾付近に:

```ts
this.clearConnectionTimeout();
this.clearMonitorSignalingWebSocketEvent();
this.clearMonitorIceConnectionStateChange();
```

`setConnectionTimeout` 冒頭:

```ts
this.clearConnectionTimeout();
```

`monitorSignalingWebSocketEvent` 冒頭:

```ts
this.clearMonitorSignalingWebSocketEvent();
```

C-5（issue 別件で対応）とまとめて 1 ブランチで進めるのが効率的。
