# `monitorSignalingWebSocketEvent` の interval が `connect()` 連続呼び出しで孤児化する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-monitor-signaling-ws-interval-orphan

## 目的

1 回目の `connect()` が `Promise.race` で敗者になった後 (= `setConnectionTimeout` 経由のタイムアウトや `monitorSignalingWebSocketEvent` 経由の ws onclose / onerror で reject)、ユーザーが直後に 2 回目の `connect()` を呼ぶと、`initializeConnection` (`src/base.ts:820-848`) 内で `clearMonitorSignalingWebSocketEvent` が呼ばれていないため、1 回目の `monitorSignalingWebSocketEvent` (`src/base.ts:1592-1617`) で起動した `setInterval` が走り続ける。2 回目の `monitorSignalingWebSocketEvent` が `this.monitorSignalingWebSocketEventTimerId` を上書きしても、1 回目の interval は別 timer ID として残り、新 ws (= 2 回目の connect で作られた WebSocket) の `onclose` / `onerror` ハンドラを `this.ws` チェック後に上書きする (`src/base.ts:1599-1614`) ため、新 ws のハンドラ構成が破壊される。

合わせて `signalingTerminate()` (`src/base.ts:582-598`) も `initializeConnection()` を呼ぶが、現状は `clearMonitorSignalingWebSocketEvent()` を呼ばない。connect 失敗時の主要経路の一つ。

**0006 先行必須 (0011 着手前):** 本 issue は `initializeConnection` に `clearMonitorIceConnectionStateChange()` を追加する。0006 未マージだと `clearInterval` のまま `setTimeout` ID を clear できない。**0006 → 0011 の順を必須とする。**

## 優先度根拠

High。アプリ側で「`connect()` 失敗 → 即リトライ」を実装した場合に高確率で発火する。`finally` (`src/publisher.ts:23-30` / `src/subscriber.ts:19-26` / `src/messaging.ts:22-29`) で `clearConnectionTimeout` と `clearMonitorSignalingWebSocketEvent` を呼んでいるため、`multiStream` の `Promise.race` 結果が確定した後は clear される設計だが、リトライまでの間に `monitorSignalingWebSocketEvent` の `setInterval` が 100ms 周期で動いており、`finally` が実行されるタイミングと 2 回目 `connect()` の `initializeConnection` 実行タイミングがミリ秒オーダーでレースする。`finally` 後に 2 回目が始まれば実害はないが、`finally` 前に 2 回目が走り始めると 1 回目 interval が新 ws を踏む。

## 現状

`initializeConnection` (`src/base.ts:820-848`)

```ts
private initializeConnection(): void {
  // ... 各種状態の初期化 ...
  this.clearConnectionTimeout();
}
```

末尾 (`src/base.ts:847`) で `clearConnectionTimeout` のみ呼んでいる。`clearMonitorSignalingWebSocketEvent` (`src/base.ts:1746-1748`) と `clearMonitorIceConnectionStateChange` (`src/base.ts:1753-1755`) は呼ばれていない。

`monitorSignalingWebSocketEvent` (`src/base.ts:1592-1617`)

```ts
protected async monitorSignalingWebSocketEvent(): Promise<void> {
  return new Promise((_resolve, reject) => {
    this.monitorSignalingWebSocketEventTimerId = setInterval(() => {
      if (!this.ws) {
        return;
      }
      this.clearMonitorSignalingWebSocketEvent();
      this.ws.onclose = (event): void => { /* ... */ };
      this.ws.onerror = (_): void => { /* ... */ };
    }, 100);
  });
}
```

冒頭で前回 `monitorSignalingWebSocketEventTimerId` を clear せず、いきなり `setInterval` で上書きする。1 回目の interval が `this.ws !== null` を観測するタイミングで `this.ws.onclose` / `this.ws.onerror` を上書きし、自分自身を `clearMonitorSignalingWebSocketEvent` でクリアして `Promise` の `reject` を握ったまま終了する。問題は `this.ws` が 2 回目 connect で作られた新 ws を指している場合で、1 回目の interval が新 ws のハンドラを破壊する。

`setConnectionTimeout` (`src/base.ts:1712-1734`) も冒頭で前回の `connectionTimeoutTimerId` を clear しない。連続呼び出しで前回タイマーが孤児化する経路は同型。

`clearMonitorSignalingWebSocketEvent` 内部は `clearInterval(this.monitorSignalingWebSocketEventTimerId)` (`src/base.ts:1747`) で、`setInterval` の戻り値型と整合 (issue 0006 で問題視した `clearMonitorIceConnectionStateChange` の `clearInterval` 誤用とは異なる。こちらは正しい)。

## 設計方針

`initializeConnection` 末尾で 3 種類のタイマー (`connectionTimeout` / `monitorSignalingWebSocketEvent` / `monitorIceConnectionStateChange`) を一括クリアする。加えて `setConnectionTimeout` / `monitorSignalingWebSocketEvent` の冒頭でも防御的にクリアし、`initializeConnection` を経由しない直接呼び出し経路でも孤児化しない 2 段構えとする。

`src/base.ts:820-848` の `initializeConnection` 末尾を次の通り変更する。

```ts
private initializeConnection(): void {
  this.simulcast = false;
  this.spotlight = false;
  // ... 既存の状態初期化 ...
  this.connectedCallbackCalled = false;
  this.clearConnectionTimeout();
  this.clearMonitorSignalingWebSocketEvent();
  this.clearMonitorIceConnectionStateChange();
}
```

`src/base.ts:1712-1734` の `setConnectionTimeout` を次の通り変更する。

```ts
protected async setConnectionTimeout(): Promise<void> {
  this.clearConnectionTimeout();
  return new Promise((_resolve, reject) => {
    if (this.connectionTimeout > 0) {
      this.connectionTimeoutTimerId = setTimeout(() => {
        // ... 既存処理 ...
      }, this.connectionTimeout);
    }
  });
}
```

`src/base.ts:1592-1617` の `monitorSignalingWebSocketEvent` を次の通り変更する。

```ts
protected async monitorSignalingWebSocketEvent(): Promise<void> {
  this.clearMonitorSignalingWebSocketEvent();
  return new Promise((_resolve, reject) => {
    this.monitorSignalingWebSocketEventTimerId = setInterval(() => {
      // ... 既存処理 ...
    }, 100);
  });
}
```

冒頭の `clear` 呼び出しは `initializeConnection` での一括クリアと二重防御になる。`initializeConnection` 単独で十分という考え方もあるが、`setConnectionTimeout` / `monitorSignalingWebSocketEvent` を直接呼ぶ将来のコードパスを増やしても安全にするために 2 段構えにする。

## 完了条件

- `initializeConnection` (`src/base.ts:820-848`) 末尾に `this.clearMonitorSignalingWebSocketEvent()` と `this.clearMonitorIceConnectionStateChange()` を追加する。`this.clearConnectionTimeout()` は既存
- `setConnectionTimeout` (`src/base.ts:1712-1734`) の **メソッド冒頭** (`return new Promise` の直前) で `this.clearConnectionTimeout()` を呼ぶ
- `monitorSignalingWebSocketEvent` (`src/base.ts:1592-1617`) の **メソッド冒頭** (`return new Promise` の直前) で `this.clearMonitorSignalingWebSocketEvent()` を呼ぶ
- 修正後、`connect()` を連続で 2 回呼んでも 1 回目の interval が 2 回目の ws ハンドラを破壊しない
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- E2E: `e2e-tests/sendrecv/main.ts` に「1 回目: `connectionTimeout: 1` 等で ws 作成後タイムアウト失敗 → 2 回目: 正しい URL でリトライ」のシナリオを仕込む (不正 URL のみだと `this.ws` 未作成で interval が空回りし、修正の核心を検証しにくい)。新規テスト `e2e-tests/tests/connect_retry.test.ts` で 10 回連続リトライを行う。2 回目の `connect()` が成功すること、リトライ中に `callbacks.disconnect` が誤発火しないこと、最終的に `connection.pc.connectionState === "connected"` になることを assert する
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] connect() の連続リトライで monitorSignalingWebSocketEvent / setConnectionTimeout のタイマーが孤児化していたのを修正する
    - @voluntas
  ```
- 4 系統 (`disconnect` / `abend` / `abendPeerConnectionState` / `shutdown`) の冪等化リファクタは issue 0030 (`issues/0030-refactor-abend-shutdown-idempotency.md`) で扱うため、本 issue とはマージ順の競合はない (本 issue は `initializeConnection` 末尾への追加と `setConnectionTimeout` / `monitorSignalingWebSocketEvent` 冒頭への追加のみで関数本体を再構成しない)
