# `disconnectWebSocket` が `null` を返すと `disconnect` callback が発火しない

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-disconnect-websocket-null-callback

## 目的

`disconnect()` の `signalingSwitched === false` 経路 (`src/base.ts:1086-1094`) で、`disconnectWebSocket` (`src/base.ts:858-908`) が `null` を返したとき、`event` が `null` のまま `if (event)` (`src/base.ts:1096`) を素通りして `callbacks.disconnect(event)` (`src/base.ts:1102`) が呼ばれない。

ただし `disconnectWebSocket` の null 返却経路は **2 種類あり、両方を同一 fix してはならない**:

| 経路 | 行                           | 意味                                                                                                            | fix 方針                                          |
| ---- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| A    | 870-872 (`!this.ws`)         | 未接続、`connect()` 冒頭の内部掃除 (`publisher.ts:42` 等)、`signalingTerminate()` / `shutdown()` / `abend()` 後 | **null のまま維持** (callback 不発は意図的)       |
| B    | 901-905 (`readyState !== 1`) | `this.ws` は存在するが OPEN 以外 (CLOSING / CLOSED 等)                                                          | **正常切断として event を生成** (本 issue の対象) |

本 issue は **経路 B のみ** を修正する。経路 A で `callbacks.disconnect` を発火させると、`connect()` 開始直後の内部 `disconnect()` でも callback が毎回走り、API 契約が壊れる。

## 優先度根拠

High。経路 B は接続済み (または connect 試行中に `this.ws` 代入済み) の状態でユーザーが `disconnect()` を呼ぶ実運用で踏みうる。

典型シナリオ: サーバー側 close 進行中 (ws `CLOSING`) にユーザーが `disconnect()` を呼ぶ。

1. `disconnect()` 冒頭 (1063-1070 行) が `monitorWebSocketEvent()` の `onclose` → `shutdown` / `abend` ハンドラを **ログ専用に差し替え**、以降 onclose でも自動 callback しない
2. `disconnectWebSocket` が 901-905 (非 OPEN) に入り、現状 `resolve(null)` → **callback 完全欠落**

`this.ws` は `signaling()` 内 connect メッセージ send 後に代入される (`src/base.ts:1325-1328`)。

**注意:** ws が完全に `CLOSED` かつ onclose 処理済みで `this.ws === null` になった後の user `disconnect()` は **経路 A** であり、本 issue の対象外 (callback 不発は意図的)。

`signalingSwitched === true` 経路 (`src/base.ts:1076-1085`) では `disconnectWebSocket` は 862-868 で null を返すが、`event` は `disconnectDataChannel` の結果 (1080-1082) で既に設定済みのため対象外 (0031 が abend 上書きを別途修正)。

## 現状

`src/base.ts:1086-1094`

```ts
} else {
  const reason = await this.disconnectWebSocket("NO-ERROR");
  this.maybeClosePeerConnection();
  this.forceCloseDataChannels();
  if (reason !== null) {
    event = this.soraCloseEvent("normal", "DISCONNECT", reason);
  }
}
```

`disconnectWebSocket` 901-905 行:

```ts
} else {
  // ws の state が open ではない場合は後処理をして終わる
  this.ws.close();
  this.ws = null;
  resolve(null);
}
```

経路 B で `reason === null` のまま callback 不発。870 経路は現状どおり callback 不発が正しい。

## 設計方針

**`disconnect()` 側の `reason ?? 正規化` は採用しない** (870 経路まで event 生成してしまうため)。

`disconnectWebSocket` の **901-905 経路のみ** `resolve(null)` を `resolve({ code: 1000, reason: "NO-ERROR" })` に変更する。870 経路は変更しない。

```ts
} else {
  this.ws.close();
  this.ws = null;
  resolve({ code: 1000, reason: "NO-ERROR" });
}
```

path B では実際の `CloseEvent.code` / `reason` ではなく synthetic `{ code: 1000, reason: "NO-ERROR" }` を返す (OPEN 経路 timeout フォールバックは `{ code: 1006, reason: "" }` `899` 行。path B だけ 1000 固定は意図した正規化)。

`disconnect()` の `if (reason !== null)` は維持する (870 経路では引き続き null のため callback 不発)。

813-814 行の event 二重生成は issue 0030 管轄。本 issue では触らない。

**変更対象:** `src/base.ts` の `disconnectWebSocket` 901-905 行のみ (0002 マージ後は async IIFE 内の同一箇所)

## 完了条件

- `disconnectWebSocket` (`src/base.ts:901-905`) が OPEN 以外の ws に対して `{ code: 1000, reason: "NO-ERROR" }` を返す (870 経路は `null` のまま)
- `signalingSwitched === false` かつ経路 B で `disconnect()` した場合、`callbacks.disconnect` が 1 回発火し `event.title === "DISCONNECT"` であること
- 870 経路 (`connect()` 冒頭の内部 `disconnect()` 等) では **引き続き** `callbacks.disconnect` は発火しないこと
- E2E: **`e2e-tests/sendrecv`** (WebSocket シグナリング、`signalingSwitched === false`) を使う
  - `index.html` に `#disconnect-count` (hidden, 初期 `0`)、`#disconnect-event-title` (hidden)、`#disconnect-api` / `#api-disconnect-status` を追加
  - `main.ts` に `VITE_TEST_API_URL` / `apiDisconnect()` (`sendonly_reconnect/main.ts` から移植)、`connection.on("disconnect", ...)` でカウンタ + `event.title` を DOM に反映
  - 新規 `e2e-tests/tests/disconnect_websocket_not_open.test.ts`: 接続確立後、`page.evaluate` 内で `await apiDisconnect(); await connection.disconnect();` を **連続** 実行 (ws `CLOSED` 待ちはしない。onclose 完了待ちは path B を経路 A に落とす)
  - `#disconnect-count === "1"` かつ `#disconnect-event-title === "DISCONNECT"` を assert
  - `RUNNER_ENVIRONMENT === "self-hosted"` 時は skip (`reconnect.test.ts` 同型)
  - **false green 防止:** `apiDisconnect` 完了を待ってから別 tick で `#disconnect` を押す手順は使わない (先に `shutdown` callback が走り修正前でも pass しうる)
- **fixture 分離:** `data_channel_signaling_only` は `signalingSwitched === true` のため 0002 用。不正 URL connect 失敗 → disconnect は 870 経路のため regression に使わない
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- CHANGES.md `## develop` に次を追記する

  ```
  - [FIX] disconnect() で WebSocket が OPEN 以外の状態のときに disconnect callback が発火しなかったのを修正する
    - @voluntas
  ```

**マージ順:** 0002 → 0005 (0002 の async IIFE 内で 901-905 相当の変更を当てる)

**スコープ外:**

- 870 経路 (未接続 / connect 失敗直後) で callback を発火させる要件
- issue 0031 (`signalingSwitched === true` 経路の event 上書き)
- 0002 マージ後の sequential 2 回目 `disconnect()` (870 経路) で callback が再発火するか — 870 は引き続き null のため不発が正しい
