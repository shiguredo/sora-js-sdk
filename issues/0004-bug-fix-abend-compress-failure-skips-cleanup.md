# `abend()` 中の `compressMessage` 失敗で後続クリーンアップと disconnect 通知が実行されない

- Priority: Medium
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-abend-compress-failure-skips-cleanup

## 目的

`abend()` (`src/base.ts:716-815`) で DataChannel 経由の `type: disconnect` メッセージを送る前に `await compressMessage(binaryMessage)` (`src/base.ts:757`) を呼ぶが、この `await` が try/catch されておらず、`compressMessage` (`src/utils.ts:500-`) が throw すると `abend` の関数スコープを同期的に抜けて後続の `disconnectWebSocket(title)` (`src/base.ts:803`) / `maybeClosePeerConnection()` (`src/base.ts:804`) / `initializeConnection()` (`src/base.ts:805`) / `writeSoraTimelineLog("disconnect-abend", event)` (`src/base.ts:813`) / `callbacks.disconnect(...)` (`src/base.ts:809, 814`) がいずれも実行されない。`compressMessage` 失敗を try/catch して `abend` 内のクリーンアップに必ず到達させる。

## 優先度根拠

Medium。`compressMessage` は `new CompressionStream("deflate")` (`src/utils.ts:502`) を使う実装で、ブラウザのメモリ不足や `CompressionStream` 未対応ブラウザ・極端に巨大な入力以外で失敗する経路はほぼ無く、本番での再現報告も無い。ただし発生した場合は Sora 側にゾンビコネクションが残り、アプリ側で `callbacks.disconnect` も呼ばれず、再接続時のセッション数上限事故を誘発しうる。再現の難しさを踏まえ Medium とする。

## 現状

`src/base.ts:755-775` の `abend` 内、圧縮ありの DataChannel 送信ブロック:

```ts
if (this.signalingOfferMessageDataChannels.signaling?.compress === true) {
  const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
  const compressedMessage = await compressMessage(binaryMessage);
  if (this.soraDataChannels.signaling.readyState === "open") {
    // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
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
}
```

内側の `send()` は try/catch で守られている (Firefox 対策のコメント付き) のに対し、外側の `await compressMessage(...)` (757 行) は守られていない。`compressMessage` が throw すると同じ `abend` 関数内の以降のコード (圧縮なし経路 776-793、DataChannel close ループ 795-802、`disconnectWebSocket` / `maybeClosePeerConnection` / `initializeConnection` / `callbacks.disconnect` 803-814) がすべて実行されないまま `abend` の Promise が reject される。呼び出し側 (`src/base.ts:1642, 1650, 2155` で `await this.abend(...)` する箇所はいずれも try/catch を持たない) には unhandled rejection が伝播するだけで、SDK 側の終了処理は走らない。

呼び出し側の修正で握り潰すのではなく、`abend` 内で `compressMessage` 失敗を局所的に catch して以降のクリーンアップに必ず到達させる。

同型のパターン (`await compressMessage(...)` を try/catch なしで呼ぶ箇所) は本 issue の対象外として、別 issue で扱う。

- `disconnectDataChannel` (`src/base.ts:978`)
- `sendSignalingMessage` 系 (`src/base.ts:2308`)
- `sendStatsMessage` 系 (`src/base.ts:2337`)
- public API の `sendMessage` (`src/base.ts:2428`)

`sendRpcMessage` 系 (`src/base.ts:2545, 2605`) は `.catch(...)` 付きで呼ばれているため対象外。

## 完了条件

- `src/base.ts:757` の `await compressMessage(binaryMessage)` が try/catch で囲まれている
- catch 時に `writeSoraTimelineLog("abend-failed-to-compress", { reason: String(error) })` 相当のログが残る
- catch を抜けた後も `abend` 内の `for (const key of Object.keys(this.soraDataChannels)) { ... }` (`src/base.ts:795-802`)、`disconnectWebSocket(title)` (`src/base.ts:803`)、`maybeClosePeerConnection()` (`src/base.ts:804`)、`initializeConnection()` (`src/base.ts:805`)、`callbacks.disconnect(...)` (`src/base.ts:809, 814`) のすべてに到達する
- `compressMessage` の人工失敗は `CompressionStream` を制御できないため再現が困難。テストは追加せず、コードレビューで局所 try/catch の到達性を担保する。CLAUDE.md「モックやスタブは絶対に利用しないこと」の規約上、`compressMessage` をスタブ化したユニットテストは追加しない
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] abend() で compressMessage が失敗したときに後続のクリーンアップと disconnect 通知が実行されないのを修正する
    - @voluntas
  ```
- 同型バグ 4 件 (`disconnectDataChannel` `:978`、`sendSignalingMessage` `:2308`、`sendStatsMessage` `:2337`、public `sendMessage` `:2428`) は本 issue 着手前に `issues/SEQUENCE` から 4 連番採番して issue 雛形 (タイトル・優先度・目的のみ) を `issues/` 配下に先に作成し、`issues/SEQUENCE` を +4 更新する。雛形作成は別ブランチ・別 PR

## 解決方法

`src/base.ts:755-775` の圧縮ありブロックを次の通り書き換える。外側の `await compressMessage` を try で囲み、失敗時はタイムラインにログを残して内側の `send()` ブロックをスキップして次の処理に進む形にする。

```ts
if (this.signalingOfferMessageDataChannels.signaling?.compress === true) {
  const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
  try {
    const compressedMessage = await compressMessage(binaryMessage);
    if (this.soraDataChannels.signaling.readyState === "open") {
      // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
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
    this.writeSoraTimelineLog("abend-failed-to-compress", { reason: String(error) });
  }
}
```

`abend` 全体を `try { ... } finally { ... }` で包むリファクタは本 issue では行わない。最小修正に絞ることで他 5 箇所への影響を切り離す。
