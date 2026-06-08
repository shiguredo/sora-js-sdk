# `abend()` 中の `compressMessage` 失敗で後続クリーンアップと disconnect 通知が実行されない

- Priority: Medium
- Created: 2026-05-21
- Polished: 2026-06-08
- Model: Opus 4.7
- Branch: feature/fix-abend-compress-failure-skips-cleanup

## 目的

`abend()` (`src/base.ts:716-815`) で DataChannel 経由の `type: disconnect` を送る前に `await compressMessage(binaryMessage)` (`src/base.ts:757`) を呼ぶが、この `await` が try/catch されておらず、`compressMessage` (`src/utils.ts:500-504`) が throw / reject すると `abend` の Promise が reject され、後続の DataChannel close ループ (`src/base.ts:795-802`)、`disconnectWebSocket` / `maybeClosePeerConnection` / `initializeConnection` (`src/base.ts:803-805`)、`callbacks.disconnect` (`src/base.ts:809, 814`) に到達しない。`compressMessage` 失敗を局所 try/catch して `abend` 内のクリーンアップに必ず到達させる。

**本 issue のスコープ:** `abend()` 内の compress 経路のみ。`await disconnectWebSocket` (803 行) の reject、`disconnectWebSocket` 内 `ws.send` (891 行) の同期 throw 等は別 issue (0034 等)。`abendPeerConnectionState()` は Sora へ disconnect を送らない別経路。

## 優先度根拠

Medium。`compressMessage` は `CompressionStream("deflate")` を使い、メモリ不足・未対応環境・巨大入力以外では失敗しにくく、本番再現報告も無い。発生時は SDK 内部状態が残り `callbacks.disconnect` も呼ばれず、再接続時のセッション数上限事故を誘発しうる。発生条件は後述「再現条件」を参照。

## 現状

### コードパス

`src/base.ts:757` の `await compressMessage(binaryMessage)` のみ未捕捉。内側の `send()` (760-774 行) は try/catch 済み (Firefox 対策)。compress throw 時は 795 行以降の DataChannel close ループ、`disconnectWebSocket` / `maybeClosePeerConnection` / `initializeConnection` / `callbacks.disconnect` がすべてスキップされる。

呼び出し側 (`src/base.ts:1642, 1650, 2155`) は try/catch なし。compress reject 時は unhandled rejection も発生する。

同型パターン 4 箇所は issue 0034 で扱う: `disconnectDataChannel` (`:978`)、`sendSignalingMessage` (`:2308`)、`sendStatsMessage` (`:2337`)、public `sendMessage` (`:2428`)。`sendRpcMessage` 系 (`.catch` 付き) は対象外。

### 再現条件 (コードパス)

- 前提: `this.soraDataChannels.signaling` 存在、`signalingOfferMessageDataChannels.signaling?.compress === true`
- トリガ: `abend()` 経路 (WS 異常 close / onerror、DC onerror 等) で 757 行の `compressMessage` が reject
- 結果: 795-814 行未到達、`initializeConnection` 不実行、`callbacks.disconnect` 不発
- 検証: モック禁止のため人工失敗テストは追加しない。コードレビュー + 手動確認 (DevTools で `CompressionStream` 非対応環境等) で担保

## 設計方針

`abend` 全体を try/finally で包まず、`compress === true` ブロックのみ局所 try/catch。catch 時はログを残し send をスキップして 795 行以降へ進む。`compressMessage` は async 関数のため、`new CompressionStream` の同期 throw も reject に変換され、同じ catch で拾える。

**非圧縮 fallback は意図的に行わない** (DC 圧縮 disconnect は Sora に届かない)。ただし **`signalingSwitched === false` かつ ws が OPEN の場合**、803 行 `disconnectWebSocket` 経由で **非圧縮 JSON の disconnect が ws.send される** (`src/base.ts:891-892`)。0004 は DC 側 fallback をしないだけで ws 経路は残る。

try 範囲は `binaryMessage` 生成から `send()` まで含める (0034 `disconnectDataChannel` と揃える)。813-814 行の event 二重生成は issue 0030 で扱う。本 issue では触らない。

**0007 との対比:** 0007 (`sendAnswer`) は cleanup 後 rethrow。0004 (`abend`) は log して cleanup 継続 (throw しない)。文脈が異なり矛盾しない。

**hang は対象外:** `compressMessage` が reject / throw しないまま完了しない場合は本 fix 対象外。

```ts
if (this.signalingOfferMessageDataChannels.signaling?.compress === true) {
  try {
    const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
    const compressedMessage = await compressMessage(binaryMessage);
    if (this.soraDataChannels.signaling.readyState === "open") {
      try {
        this.soraDataChannels.signaling.send(compressedMessage);
        this.writeDataChannelSignalingLog(
          "send-disconnect",
          this.soraDataChannels.signaling,
          message,
        );
      } catch (error) {
        const errorMessage = (error as Error).message;
        this.writeDataChannelSignalingLog(
          "failed-to-send-disconnect",
          this.soraDataChannels.signaling,
          errorMessage,
        );
      }
    }
  } catch (error) {
    const errorMessage = (error as Error).message;
    this.writeDataChannelSignalingLog(
      "failed-to-compress-disconnect",
      this.soraDataChannels.signaling,
      errorMessage,
    );
  }
}
```

compress 失敗ログは `failed-to-compress-disconnect`。error の文字列化は既存 760-774 と揃えて `(error as Error).message` を使うが、`compressMessage` は Stream 系 API のため `DOMException` 等 非 Error を reject しうる。`String(error)` でも可 (0034 水平展開時に統一する)。

**関連 issue:**

- 0034: 0004 パターンの水平展開。0004 単独マージ後も `disconnectDataChannel` 等は未修正のまま
- 0030: 813-814 二重 event + `runShutdownOnce` 統合。**0030 完了条件に 0004 の compress try/catch 移植要件を追記すること** (0030 マージ時にリグレッション防止)
- 0009: 同一 `abend()` を編集 (719-724 行)。0004 先行推奨

**変更対象:** `src/base.ts` の `abend()` compress 分岐のみ

## 完了条件

- `abend()` の `compress === true` 分岐 (`binaryMessage` 生成〜 `send()` まで) に局所 try/catch が入っている
- catch 後も DataChannel close ループ / ws・pc cleanup / `callbacks.disconnect` (795-814 行相当) に到達する
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- CHANGES.md `## develop` に次を追記する

  ```
  - [FIX] abend() で compressMessage が失敗したときに後続のクリーンアップと disconnect 通知が実行されないのを修正する
    - @voluntas
  ```

**マージ順 (0004 関連チェーン):**

```
0004 → 0006 → (0011) → 0021 → 0009 → 0001 → 0008 → 0007 → 0034 → 0031 → 0002 → 0005 → 0030
```

このチェーンを正本とし、0030 / 0034 の転記も同一に揃える。

- **0021** は `ConnectError` constructor を変更し 0007 / 0008 の前提
- **0001 → 0008**: 同一 `signaling()` を編集 (0008 が 0001 を内包)
- **0008 → 0007**: 0007 の `sendAnswer` 失敗経路は 0008 が整える onmessage 例外基盤の上に乗る
- **0009** は 0007 より先 (Trickle ICE 発火源 `onicecandidate` を停止)
- **0011** は 0006 直後 (0006 issue 参照)
- **0034** までを 1 セットとして扱う (0004 単独では `disconnectDataChannel` 等の同型問題は残る)
- **0030** マージ時は compress try/catch を `runShutdownOnce` 内へ移植
