# `sendSignalingMessage` / `sendStatsMessage` の send 同期例外と readyState ガードを修正する

- Priority: Medium
- Created: 2026-05-25
- Polished: 2026-06-08
- Model: Composer 2.5
- Branch: feature/fix-signaling-send-sync-exceptions

## リスコープ理由

元の本 issue は 0004 の修正パターン (`compressMessage` を局所 try/catch で握る) を 4 関数に水平展開する設計だったが、`compressMessage` の失敗は事実上ブラウザの `CompressionStream` 非対応に限定されるため、対症療法でなく機能検出 (LBYL) で扱うべきと判断。`compressMessage` 関連は issue 0040 (`Sora.getCapabilities()` API 設計) へ移管し、本 issue は **send (`DataChannel.send` / `ws.send`) の同期例外と readyState ガード欠落** に絞り込む。

## 目的

`sendSignalingMessage` (`src/base.ts:2301-2322`) / `sendStatsMessage` (`src/base.ts:2329-2343`) の send が try/catch 外で、`DataChannel.send` / `ws.send` の同期例外が unhandled rejection になる。さらに `sendSignalingMessage` の DataChannel 分岐 (`:2309` / `:2311`) には readyState チェックが無く、ws 分岐 (`:2318`) も `this.ws !== null` のみで `readyState === WebSocket.OPEN` を見ない。各送信箇所に局所 try/catch + readyState ガードを入れ、未送信時はログを残して継続する。

**スコープ外 (別 issue):**

- `compressMessage` 関連すべて: issue 0040 (`Sora.getCapabilities()` API 設計) で機能検出方針に転換。0004 は close 済
- `sendAnswer` の `ws.send` (`:1512`): issue 0007
- `onicecandidate` 経路 (`:1553` の `sendSignalingMessage` 呼び出しを含むハンドラ): issue 0009。0009 が `sendSignalingMessage` を呼ぶ経路の unhandled rejection 防止は本 issue の `sendSignalingMessage` 修正でカバーする (0009 は発火源停止、本 issue は send 側捕捉で二重防御、相互代替不可)

**スコープ外 (本 issue では触らない):**

- `disconnectDataChannel` (`:976-1017`): send は try/catch 済。compress 部分は issue 0040 待ち
- public `sendMessage` (`:2414-2433`): async 関数の戻り Promise でそのまま呼び出し側に throw される (現状維持)
- `sendRpcMessage` 系 (`:2545`, `:2605`): compress が `.then().catch()`、send が try/catch 済で防御済み
- `disconnectWebSocket` (`:891`)、`signalingOnMessageTypePing` (`:1992`)、`getSignalingWebSocket` 内 (`:1326`) は別問題

## 優先度根拠

Medium。`sendSignalingMessage` / `sendStatsMessage` 経由で `DataChannel.send` / `ws.send` の同期例外が unhandled rejection になりうる。0007 / 0009 が個別に表層を塞いでも、本 issue の 2 関数からサイレント失敗が残る。

## 現状

現 `sendSignalingMessage` (`:2305-2321`):

- DataChannel send (`:2309`/`:2311`) に readyState チェックが無い
- ws 分岐 (`:2318`) も `this.ws !== null` のみで `readyState === WebSocket.OPEN` を見ない
- send / ws.send が try/catch 外で同期例外が unhandled rejection になる

`sendStatsMessage` (`:2329-2343`) も send (`:2338`/`:2340`) が try/catch 外。

## 設計方針

### 共通方針

- 局所 try/catch で send を囲む。readyState が open のときだけ send し、**成功ログ (`send-${type}`) も send 成功時にのみ書く** (skip / 失敗時に成功ログを残さない)
- error 文字列化は `(error as Error).message` に統一
- 共通ヘルパー化はしない (YAGNI)
- `compress === true` 分岐 (`compressMessage` を使う部分) は本 issue では触らない。issue 0040 の機能検出設計完了後に別途扱う

### `sendSignalingMessage` 修正例

`:2305-2321` の `compress === false` 経路と ws 経路を次のとおり書き換える。

```ts
if (this.soraDataChannels.signaling) {
  if (this.signalingOfferMessageDataChannels.signaling?.compress === true) {
    // compress 分岐は issue 0040 完了後に扱う。本 issue では現状維持
    const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
    const compressedMessage = await compressMessage(binaryMessage);
    this.soraDataChannels.signaling.send(compressedMessage);
    this.writeDataChannelSignalingLog(
      `send-${message.type}`,
      this.soraDataChannels.signaling,
      message,
    );
  } else if (this.soraDataChannels.signaling.readyState === "open") {
    try {
      this.soraDataChannels.signaling.send(JSON.stringify(message));
      this.writeDataChannelSignalingLog(
        `send-${message.type}`,
        this.soraDataChannels.signaling,
        message,
      );
    } catch (error) {
      this.writeDataChannelSignalingLog(
        `failed-to-send-${message.type}`,
        this.soraDataChannels.signaling,
        (error as Error).message,
      );
    }
  }
} else if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
  try {
    this.ws.send(JSON.stringify(message));
    this.writeWebSocketSignalingLog(`send-${message.type}`, message);
  } catch (error) {
    this.writeWebSocketSignalingLog(`failed-to-send-${message.type}`, (error as Error).message);
  }
}
```

`WebSocket.OPEN` は定数表記を使う (既存に合わせて `=== 1` でも可)。

**readyState skip の妥当性:** 非 open チャネルへの送信を skip して握りつぶすのは teardown / 切断進行中のケースで、ここで throw すると本 issue が防ぎたい unhandled rejection が再発する。送信失敗の検知は別経路 (ICE / WebSocket close ハンドラ) が担う。`sendSignalingMessage` を呼ぶ re-answer / update-answer 経路 (`:1919`, `:1932`) も同方針。

### `sendStatsMessage`

成功時ログは現状存在しない。失敗時は throw せず return し、`writeDataChannelSignalingLog("failed-to-send-stats", this.soraDataChannels.stats, (error as Error).message)` でログを残す。compress 分岐は触らない (issue 0040 待ち)。

## 完了条件

- `sendSignalingMessage` / `sendStatsMessage` の **`compress === false`** 分岐と ws 分岐に try/catch + readyState ガードが入っている
- error 文字列化が修正箇所で `(error as Error).message` に統一されている
- `compressMessage` 関連は本 issue では触らない (issue 0040 完了後に別 issue で扱う)
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- CHANGES.md `## develop` 直下 (既存 `[FIX]` 群の後に置き、担当者行は 2 文字インデント) に追記する

  ```
  - [FIX] sendSignalingMessage / sendStatsMessage の DataChannel.send / ws.send 同期例外を捕捉する
    - @voluntas
  ```

## 関連 issue

- **0004 (close 済)**: `abend()` の compress 失敗対応は LBYL に方針転換
- **0040**: `Sora.getCapabilities()` API 設計 (機能検出方針)。本 issue の compress 分岐は 0040 完了後に別 issue で扱う
- **0007**: `sendAnswer` の `ws.send` 同期例外。本 issue と独立した別経路
- **0009**: `onicecandidate` ハンドラの停止。本 issue の `sendSignalingMessage` 修正と二重防御
