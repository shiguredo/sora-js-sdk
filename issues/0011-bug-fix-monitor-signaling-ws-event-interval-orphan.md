# `connect()` 連続呼び出しでシグナリング監視タイマー (monitorSignalingWebSocketEvent / setConnectionTimeout) が孤児化する

- Priority: High
- Created: 2026-05-21
- Polished: 2026-06-08
- Model: Opus 4.7
- Branch: feature/fix-monitor-signaling-ws-interval-orphan

## 目的

1 回目の `connect()` が失敗した後に 2 回目の `connect()` を呼ぶと、1 回目で起動した `monitorSignalingWebSocketEvent` (`src/base.ts:1592-1617`) の `setInterval` や `setConnectionTimeout` (`src/base.ts:1712-1734`) の `setTimeout` が孤児化し、新 ws (2 回目の WebSocket) のハンドラ構成を破壊したりタイムアウトを誤発火させたりする。`initializeConnection` (`src/base.ts:820-848`) は 2 回目 `connect()` の冒頭 (`multiStream` → `disconnect` 経由) で呼ばれるが、末尾 (`:847`) で `clearConnectionTimeout()` のみ呼び、`clearMonitorSignalingWebSocketEvent` / `clearMonitorIceConnectionStateChange` を呼ばないため、1 回目のタイマーが残る。

### 孤児化が成立する機序

`monitorSignalingWebSocketEvent` の interval コールバックは `this.ws` を観測した最初の tick で `clearMonitorSignalingWebSocketEvent()` (`:1598`) を呼んで自己終了する。したがって孤児化が問題になるのは、1 回目の interval が **`this.ws` を観測しないまま回り続ける** ケースである:

- 1 回目が ws open 前に失敗 (例: `getSignalingWebSocket` の reject) すると `this.ws` は signaling 内 (`:1328`) で代入されず、interval は `if (!this.ws) return` (`:1595`) で空回りし自己 clear しない。
- 1 回目が `setConnectionTimeout` のタイムアウトで reject した場合、reject 元は `Promise.race` の timeout 側で `multiStream` 自体は pending のまま残りうる。`clear` を呼ぶ `finally` (`src/publisher.ts` / `src/subscriber.ts` / `src/messaging.ts` の各 connect、同一構造) は `multiStream` に付いているため、`multiStream` が pending だと走らない。タイムアウトコールバックは `signalingTerminate()` (`:1728`) → `initializeConnection()` (`:597`) を呼ぶので、本 issue の修正後はそこで clear されるが、修正前は `initializeConnection` が clear しないため残る。

`monitorSignalingWebSocketEventTimerId` は単一フィールドのため、上記で残った 1 回目 interval が回っている間に 2 回目 `connect()` の `monitorSignalingWebSocketEvent` が `setInterval` でフィールドを上書きすると、1 回目 interval は参照を失い `clearMonitorSignalingWebSocketEvent` でも止められなくなる (clear はフィールド = 2 回目 ID を消す)。孤児化した 1 回目 interval が新 ws の `onclose` / `onerror` を上書きし (`:1599-1614`)、新接続のハンドラ構成を壊す。

2 回目 `connect()` の実行順 (`Promise.race` の配列は同期評価) は `multiStream()` → 内部 `disconnect()` → `setConnectionTimeout()` → `monitorSignalingWebSocketEvent()` で、`disconnect()` 内の `initializeConnection()` は `await this.disconnectWebSocket(...)` (`:1087`) の後 (`:1095`) に走る。一方 `monitorSignalingWebSocketEvent` の `setInterval` 上書きは同期的に先に起きる。したがって **フィールド上書きは `initializeConnection` が走るより前に発生する**。

## 優先度根拠

High。アプリ側で「`connect()` 失敗 → 即リトライ」を実装した場合に踏みうる。特にタイムアウト失敗 (`multiStream` が pending のまま reject される経路) では `finally` による clear が走らないため孤児化しやすい。ただし発生は呼び出しタイミングに依存し、決定論的に毎回再現するわけではない。

## 現状

`initializeConnection` (`src/base.ts:820-848`) は末尾 (`:847`) で `this.clearConnectionTimeout()` のみ呼ぶ。`clearMonitorSignalingWebSocketEvent` (`src/base.ts:1746-1748`、`clearInterval` 使用で `setInterval` と整合) と `clearMonitorIceConnectionStateChange` (`src/base.ts:1753-1755`) は呼ばれない。

`monitorSignalingWebSocketEvent` (`src/base.ts:1592-1617`) と `setConnectionTimeout` (`src/base.ts:1712-1734`) はいずれもメソッド冒頭で前回タイマーを clear せず、いきなり `setInterval` / `setTimeout` でフィールドを上書きする。

`signalingTerminate()` (`src/base.ts:582-598`) も末尾 (`:597`) で `initializeConnection()` を呼ぶ。connect 失敗時の主要経路の一つで、`initializeConnection` に clear を足せばこの経路も自動的にカバーされる。

## 設計方針

`setConnectionTimeout` / `monitorSignalingWebSocketEvent` の冒頭で、`setInterval` / `setTimeout` でフィールドを上書きする前に前回タイマーを clear する (**主防御**)。上記「実行順」のとおり 2 回目 `connect()` ではフィールド上書きが `initializeConnection` より前に起きるため、フィールド上書き孤児化を実際に止めるのはこの冒頭 clear である (2 回目の monitor / timeout が自身の `setInterval` / `setTimeout` の直前に旧 ID を確実に clear する)。加えて `initializeConnection` 末尾で 3 種類のタイマー (`connectionTimeout` / `monitorSignalingWebSocketEvent` / `monitorIceConnectionStateChange`) を一括クリアする (**補助防御**。`disconnect` / `abend` / `abendPeerConnectionState` / `shutdown` / `signalingTerminate` 経由の cleanup や、再 connect を伴わない経路をカバーする)。

- `initializeConnection` (`:820-848`) 末尾の `this.clearConnectionTimeout();` (`:847`) の下に `this.clearMonitorSignalingWebSocketEvent();` と `this.clearMonitorIceConnectionStateChange();` を追加する。
- `setConnectionTimeout` (`:1712-1734`) の `return new Promise` の直前に `this.clearConnectionTimeout();` を追加する。
- `monitorSignalingWebSocketEvent` (`:1592-1617`) の `return new Promise` の直前に `this.clearMonitorSignalingWebSocketEvent();` を追加する。

**0006 との順序 (推奨):** 本 issue は `initializeConnection` に `clearMonitorIceConnectionStateChange()` 呼び出しを追加する。`clearMonitorIceConnectionStateChange` は `setTimeout` の ID に `clearInterval` を使っているが、ブラウザでは timer ID 名前空間が共有されるため機能上は解除できる (0006 参照)。したがって 0011 単独でも機能するが、API 整合のため 0006 (`clearInterval` → `clearTimeout` に統一) を先にマージするのを推奨する (`0006 → 0011`)。

4 系統 (`disconnect` / `abend` / `abendPeerConnectionState` / `shutdown`) の冪等化リファクタは issue 0030 で扱う。本 issue は `initializeConnection` 末尾と 2 メソッド冒頭への追加のみで関数本体を再構成しないためマージ順の競合はないが、0030 が `initializeConnection` をリファクタする際は本 issue で追加した 2 行の clear を維持すること。

## 完了条件

- `initializeConnection` (`:847` の下) に `this.clearMonitorSignalingWebSocketEvent()` と `this.clearMonitorIceConnectionStateChange()` を追加する
- `setConnectionTimeout` のメソッド冒頭 (`return new Promise` の直前) で `this.clearConnectionTimeout()` を呼ぶ
- `monitorSignalingWebSocketEvent` のメソッド冒頭 (`return new Promise` の直前) で `this.clearMonitorSignalingWebSocketEvent()` を呼ぶ
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- CHANGES.md `## develop` に次を追記する (既存 FIX 群の後ろ、担当者行は 2 文字インデント)
  ```
  - [FIX] connect() の連続リトライで monitorSignalingWebSocketEvent / setConnectionTimeout のタイマーが孤児化していたのを修正する
    - @voluntas
  ```

**検証の限界 (E2E は best-effort、主担保はコードレビュー):** 孤児化は呼び出しタイミング依存で決定論的に再現しにくい。また現 fixture (`e2e-tests/sendrecv/`) は `connectionTimeout` が 15_000 固定 (`main.ts`)、signaling URL も環境変数固定、`connection` が window 非公開、`disconnect` コールバック未フックで、「1 回目タイムアウト失敗 → 2 回目成功」のリトライ E2E をそのまま書けない。E2E を行う場合は (1) `connectionTimeout` を回ごとに切り替えられるよう `main.ts` / `index.html` に入力を追加、(2) `connection` を window に露出するか `connection.pc.connectionState` / `disconnect` 発火回数を hidden DOM に出す計装、を先に入れる必要がある。回帰の主担保は「3 メソッドに clear が追加されていること」のコードレビューとする。

**マージ順:** `0006 → 0011` (推奨)。リポジトリ全体の正本チェーンは issue 0004 を参照。
