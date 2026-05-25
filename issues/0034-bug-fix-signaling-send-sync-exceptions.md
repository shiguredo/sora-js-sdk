# `sendSignalingMessage` 等の `ws.send` / DataChannel.send / `compressMessage` 同期例外が未捕捉

- Priority: Medium
- Created: 2026-05-25
- Model: Composer 2.5
- Branch: feature/fix-signaling-send-sync-exceptions

## 目的

issue 0004 は `abend()` 内の `compressMessage` のみを扱う。同型パターン (try/catch なしの `await compressMessage` / 同期 `ws.send` / `DataChannel.send`) が他にも残っており、unhandled rejection やサイレント失敗の原因になる。

対象 4 関数:

| 関数                    | 行 (着手時)  | 未捕捉箇所                                                |
| ----------------------- | ------------ | --------------------------------------------------------- |
| `disconnectDataChannel` | `:976-998`   | `:978` `await compressMessage` (`send()` は try/catch 済) |
| `sendSignalingMessage`  | `:2301-2322` | `:2308` compress、`:2309`/`:2311` send、`:2319` ws.send   |
| `sendStatsMessage`      | `:2329-2343` | `:2337` compress、`:2338`/`:2340` send                    |
| public `sendMessage`    | `:2414-2433` | `:2428` compress、`:2429`/`:2431` send                    |

issue 0007 (`sendAnswer` の `ws.send` — `src/base.ts:1507-1515`) / issue 0009 (`onicecandidate` ハンドラ解除 — `src/base.ts:1553`) は別 issue。0009 が `sendSignalingMessage` を呼ぶ経路の unhandled rejection 防止は、本 issue の `sendSignalingMessage` 修正でカバーする。

`sendRpcMessage` 系 (`src/base.ts:2545`, `:2605`) は `.catch(...)` 付きのため対象外。

**本 issue スコープ外** (別 issue または将来): `disconnectWebSocket` `:891`、`signalingOnMessageTypePing` `:1992`、`getSignalingWebSocket` 内 `:1326` 等。

## 優先度根拠

Medium。0007 / 0009 が個別に表層を塞いでも、本 issue の 4 箇所から unhandled rejection / サイレント失敗が残る。0004 完了後、0004 と同じ log + 継続方針で水平展開する。

## 現状

0004 完了条件で「4 連番採番」予定だったが未作成だったため、本 issue (0034) として 1 件に統合した。

0004 の修正パターン: **局所 try/catch + timeline / signaling ログ + 以降処理継続 (または API に応じて throw)**。

## 設計方針

### 関数別方針

| 関数                    | compress 失敗時                                | send 失敗時                                      |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------ |
| `sendSignalingMessage`  | ログして return (throw しない)                 | readyState チェック + try/catch、ログして return |
| `sendStatsMessage`      | ログして return                                | readyState チェック + try/catch、ログして return |
| `disconnectDataChannel` | 0004 同型 — ログして **disconnect 継続**       | 既存 send try/catch 維持                         |
| `sendMessage` (public)  | `Error` throw (既存 readyState チェックと整合) | 同上                                             |

**非圧縮 fallback は行わない** (0004 と同じ。圧縮設定のまま非圧縮 payload を送らない)。

compress 失敗ログは 0004 の `failed-to-compress-disconnect` プレフィックスに倣い、関数ごとに `failed-to-compress-*` / `failed-to-send-*` を使う。error 文字列化は `String(error)` または `(error as Error).message` で統一する。

### `sendSignalingMessage` 修正例

`src/base.ts:2305-2321` 付近:

```ts
if (this.soraDataChannels.signaling) {
  try {
    if (this.signalingOfferMessageDataChannels.signaling?.compress === true) {
      const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
      const compressedMessage = await compressMessage(binaryMessage);
      if (this.soraDataChannels.signaling.readyState === "open") {
        this.soraDataChannels.signaling.send(compressedMessage);
      }
    } else if (this.soraDataChannels.signaling.readyState === "open") {
      this.soraDataChannels.signaling.send(JSON.stringify(message));
    }
    this.writeDataChannelSignalingLog(
      `send-${message.type}`,
      this.soraDataChannels.signaling,
      message,
    );
  } catch (error) {
    this.writeDataChannelSignalingLog(
      "failed-to-send",
      this.soraDataChannels.signaling,
      String(error),
    );
  }
} else if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
  try {
    this.ws.send(JSON.stringify(message));
    this.writeWebSocketSignalingLog(`send-${message.type}`, message);
  } catch (error) {
    this.writeWebSocketSignalingLog(`failed-to-send-${message.type}`, { reason: String(error) });
  }
}
```

compress / non-compress / ws の **3 分岐すべて** に readyState チェックを入れる。

### `disconnectDataChannel` compress ブロック

`src/base.ts:976-998` を 0004 と同型 try/catch で囲む。catch 時は timeline / signaling ログを残し **`Promise.race` へ進む**。4999 は timeout / DC onerror 専用で、**compress 失敗時は 4999 を返さない**。

### `sendStatsMessage`

失敗時は throw せず return。専用 timeline が無い場合は `writeDataChannelSignalingLog("failed-to-send-stats", ...)` 相当でログを残す (既存 stats send ログ形式に合わせる)。

### `sendMessage` (public API)

compress / send 失敗時は `Error` を throw してよい。呼び出し側が例外を処理できる public API であるため、0004 の silent 継続方針とは異なる。

### 網羅確認

着手時:

```bash
grep -n "compressMessage\|ws\.send\|\.send(" src/base.ts
```

上記 4 関数が try/catch または readyState ガード済みであることを確認する。0004 `abend()` / 0007 `sendAnswer` / スコープ外箇所は除外してレビューする。

0004 の try/catch を共通ヘルパー化するか、箇所ごと最小修正かは実装者判断 (YAGNI。1 行 helper は不要)。

### マージ順

```
0004 → 0006 → (0011) → 0021 → 0009 → 0007 → 0001 → 0008 → 0034 → 0031 → 0002 → 0030
```

- **0004 マージ後** に着手 (0004 パターンを踏襲)
- **0030 より先** にマージ (0030 は `abend` / `disconnect` 全体 refactor)
- **0031 / 0002 より先** にマージ (`disconnectDataChannel` を触る)

## 完了条件

- 上記 4 関数で方針どおり try/catch または readyState ガードが入っている
- `sendSignalingMessage` の compress / non-compress / ws 分岐すべてに readyState チェックがある
- `disconnectDataChannel` の compress 失敗後も `Promise.race` に到達し、4999 を返さない
- `grep -n "compressMessage\|ws\.send\|\.send(" src/base.ts` で対象 4 関数が防御済みであることを確認する
- compress 人工失敗のユニットテストは **追加しない** (モック禁止)
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- CHANGES.md `## develop` に次のエントリを追記する

  ```
  - [FIX] sendSignalingMessage 等の compressMessage / ws.send / DataChannel.send 同期例外を捕捉する
    - @voluntas
  ```
