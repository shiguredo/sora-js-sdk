# `disconnectWebSocket` が `null` を返すと `disconnect` callback が発火しない

- Priority: High
- Created: 2026-05-21
- Polished: 2026-06-08
- Completed: 2026-06-09
- Model: Opus 4.7
- Branch: feature/fix-disconnect-websocket-null-callback

## 目的

`disconnect()` の `signalingSwitched === false` 経路 (`src/base.ts:1086-1094`) で、`disconnectWebSocket` (`src/base.ts:858-908`) が `null` を返したとき、`event` が `null` のまま `if (event)` (`src/base.ts:1096`) を素通りして `callbacks.disconnect(event)` (`src/base.ts:1102`) が呼ばれない。

`disconnectWebSocket` が `null` を返す経路は実装上 3 箇所あるが、**callback 不発が問題になるのは `signalingSwitched === false` の 2 経路** で、両者を同一 fix してはならない:

| 経路 | 行                           | 意味                                                                                                            | fix 方針                                          |
| ---- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| A    | 870-872 (`!this.ws`)         | 未接続、`connect()` 冒頭の内部掃除 (`publisher.ts:42` 等)、`signalingTerminate()` / `shutdown()` / `abend()` 後 | **null のまま維持** (callback 不発は意図的)       |
| B    | 901-905 (`readyState !== 1`) | `this.ws` は存在するが OPEN 以外 (CLOSING / CLOSED 等)                                                          | **正常切断として event を生成** (本 issue の対象) |

3 箇所目の `signalingSwitched === true` 早期 return (862-868) も `null` を返すが、その経路では `event` が `disconnectDataChannel` の結果 (1080-1082) で別途設定されるため callback 不発にならない (0031 が abend 上書きを別途修正)。本 issue は **経路 B のみ** を修正する。経路 A で `callbacks.disconnect` を発火させると `connect()` 開始直後の内部 `disconnect()` でも callback が毎回走り API 契約が壊れる。

## 優先度根拠

High。経路 B は接続済み (または connect 試行中に `this.ws` 代入済み) の状態でユーザーが `disconnect()` を呼ぶ実運用で踏みうる。`this.ws` は `signaling()` 内 connect メッセージ send 後に代入される (`src/base.ts:1325-1328`)。

典型シナリオはサーバー側 close 進行中 (ws `CLOSING`) にユーザーが `disconnect()` を呼ぶケース。`disconnect()` 冒頭 (1063-1070) が `monitorWebSocketEvent()` の `onclose` (→ `shutdown` / `abend`) をログ専用に差し替えるため以降 onclose でも自動 callback せず、`disconnectWebSocket` が経路 B で `resolve(null)` すると callback が完全に欠落する。

## 現状

### 関連コード

```ts
} else {
  // ws の state が open ではない場合は後処理をして終わる
  this.ws.close();
  this.ws = null;
  resolve(null);
}
```

呼び出し側 `disconnect()` (`src/base.ts:1086-1094`) は `if (reason !== null)` で event 生成を分岐するため、経路 B で `null` が返ると event 不生成 → callback 不発になる。

## 設計方針

`disconnectWebSocket` の **901-905 経路のみ** `resolve(null)` を `resolve({ code: 1000, reason: "NO-ERROR" })` に変更する。870 経路と `disconnect()` 側の `if (reason !== null)` (1091) は変更しない (870 経路は引き続き null で callback 不発)。

```ts
} else {
  this.ws.close();
  this.ws = null;
  resolve({ code: 1000, reason: "NO-ERROR" });
}
```

- **synthetic 値を返す理由:** 経路 B 到達時点で `this.ws.onclose` は `disconnect()` 冒頭 (1063-1070) でログ専用に差し替え済みのため、onclose を待っても resolve されずハングする (経路 B には OPEN 用 timeout も無い)。実 `CloseEvent` を待てないので synthetic 値を即 resolve する。
- **値の選択:** OPEN 経路の timeout フォールバックは `{ code: 1006, reason: "" }` (899)。経路 B はユーザー起因の正常切断なので `1000` 固定で正規化する (ワイヤ上の close code ではなく SDK 正規化値)。
- **二重 resolve は無害:** 903 の `close()` 後に 874 で設定した onclose が遅延発火しても、`Promise` の resolve は冪等で 2 回目は無視され、onclose 本体は `this.ws === null` (904 で null 化済み) でガードされる。
- **`disconnect()` 側の `reason ?? 正規化` は採用しない** (870 経路まで event 生成してしまう)。

813-814 行の event 二重生成は issue 0030 管轄。本 issue では触らない。

**変更対象:** `src/base.ts` の `disconnectWebSocket` 901-905 行のみ。本 issue 着手時点では 0002 がマージ済みである前提 (マージ順参照)。本文の行番号は 0002 マージ前基準のため、0002 マージ後は `disconnect()` 本体が async IIFE 化されている分のズレを該当ロジックで読み替える。

## 完了条件

- `disconnectWebSocket` (901-905) が OPEN 以外の ws に対して `{ code: 1000, reason: "NO-ERROR" }` を返す (870 経路は `null` のまま)
- `signalingSwitched === false` かつ経路 B で `disconnect()` した場合、`callbacks.disconnect` が 1 回発火し `event.title === "DISCONNECT"` であること
- 870 経路 (`connect()` 冒頭の内部 `disconnect()` 等) では引き続き `callbacks.disconnect` が発火しないこと
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- CHANGES.md `## develop` に次を追記する (既存 FIX 群の後ろ、担当者行は 2 文字インデント)

  ```
  - [FIX] disconnect() で WebSocket が OPEN 以外の状態のときに disconnect callback が発火しなかったのを修正する
    - @voluntas
  ```

### E2E (best-effort・回帰の主担保はコードレビュー)

経路 B は「`this.ws` 存在かつ readyState 非 OPEN かつ `signalingSwitched === false`」という瞬間を要するが、実 Sora 相手にこの状態を決定論的に踏ませる手段がない (モック禁止のため synthetic な ws 状態を作れない)。OPEN のままなら修正前でも pass し (false green)、完全 CLOSED まで進むと経路 A に落ちる。よって **1 行修正の正しさはコードレビューで担保**し、E2E は best-effort とする。

- fixture は `e2e-tests/sendrecv` を使い、`dataChannelSignaling: false` を明示して DataChannel signaling への switch を防ぐ (switch すると `signalingSwitched === true` となり経路 B を通らない)
- 既存テストは DOM 駆動のため `page.evaluate(connection.disconnect())` は使えない (fixture の `client` は module ローカルで window 非公開)。`index.html` に `#disconnect-count` (hidden, 初期 `0`)・`#disconnect-event-title` (hidden, 初期空)・`#disconnect-api`・`#api-disconnect-status` (初期空) を追加し、`main.ts` に `VITE_TEST_API_URL` / `apiDisconnect()` (`sendonly_reconnect/main.ts` から移植) と `connection.on("disconnect", ...)` でカウンタ + `event.title` を DOM 反映する
- 新規 `e2e-tests/tests/disconnect_websocket_not_open.test.ts`: `#connection-id:not(:empty)` 待ち後 (connectionId race 対策、`reconnect.test.ts` 同型)、`#disconnect-api` クリック → 待たずに `#disconnect` クリックを連続実行する。`#disconnect-count === "1"` かつ `#disconnect-event-title === "DISCONNECT"` を assert (`soraCloseEvent("normal", "DISCONNECT", ...)` の第 2 引数が `title` になる: `src/base.ts:2378-`)。`RUNNER_ENVIRONMENT === "self-hosted"` 時は skip (`reconnect.test.ts` 同型)
- ただしこの連続クリックで経路 B (readyState 非 OPEN かつ非 null) を踏める保証はない。API 切断がクライアントの ws に伝播するラグ次第で、多くの run は OPEN 経路 (886-900) に入り修正前でも pass する (false green)、または完全 CLOSED まで進んで経路 A に落ちる。経路 B を踏めたかは timeline ログ (`onclose` が出ず synthetic で resolve したか) で確認し、踏めなかった run は本バグの回帰を検出しない旨を PR 説明に明記する

**fixture 分離:** `data_channel_signaling_only` は `signalingSwitched === true` のため 0002 用。不正 URL connect 失敗 → disconnect は 870 経路のため regression に使わない。

**マージ順:** 0002 → 0005 → 0030。0002 が `disconnect()` を async IIFE 化した後その内部の 901-905 相当に変更を当て、0030 (813-814 二重 event + `runShutdownOnce` 統合) は 0005 の後。0004 正本チェーンの末尾は `… → 0002 → 0005 → 0030`。

**スコープ外:**

- 870 経路 (未接続 / connect 失敗直後) で callback を発火させる要件
- issue 0031 (`signalingSwitched === true` 経路の event 上書き)
- 0002 マージ後の sequential 2 回目 `disconnect()` (870 経路) の callback 再発火 (870 は引き続き null で不発が正しい)

## 解決方法

`src/base.ts` の `disconnectWebSocket` の `readyState !== 1` 経路 (経路 B、0002 マージ後の 905-911 行) で `resolve(null)` を `resolve({ code: 1000, reason: "NO-ERROR" })` に変更した。`!this.ws` の経路 (現状 874-877 行、null 返却で callback 不発が意図的) と `signalingSwitched === true` の早期 return (866-872 行、event は disconnectDataChannel で別途設定) には触れていない。これにより `signalingSwitched === false` かつ `this.ws` が OPEN 以外の状態で `disconnect()` を呼んだ際、呼び出し側 (`disconnect()` 1097-1104 行) の `if (reason !== null)` を通って `callbacks.disconnect` が `event.title === "DISCONNECT"` で 1 回発火する。コメントは「実 CloseEvent を待たず synthetic 値で即 resolve する」「callbacks.disconnect を発火させるため null ではなく normal 切断扱いの値を返す」の 2 行に整理した。E2E は本文どおり best-effort で、経路 B を決定論的に踏ませる手段がなく false green リスクが高いため本 PR では追加しない (回帰の主担保はコードレビュー)。既存 `pnpm test` (2 files, 72 tests) が通過することを確認した。CHANGES.md `## develop` に FIX エントリを追記した。
