# `sendSignalingMessage` / `sendStatsMessage` の readyState ガードを追加する

- Priority: Medium
- Created: 2026-05-25
- Completed: 2026-06-14
- Polished: 2026-06-14
- Model: Composer 2.5
- Branch: feature/fix-signaling-send-sync-exceptions

## リスコープ理由

元の本 issue は 0004 の修正パターン (`compressMessage` を局所 try/catch で握る) を 4 関数に水平展開する設計だったが、`compressMessage` の失敗は事実上ブラウザの `CompressionStream` 非対応に限定されるため、対症療法でなく機能検出 (LBYL) で扱うべきと判断。`compressMessage` 関連は issue 0040 (`Sora.getCapabilities()` API 設計) へ移管し、本 issue は **send (`DataChannel.send` / `ws.send`) の readyState ガード欠落** に絞り込む。

さらに、try/catch による例外加工は避け、`readyState` による LBYL で発生しうる例外を防ぐ。これでも残る稀有なケースは呼び出し元の Promise として伝播させる。

## 目的

`sendSignalingMessage` / `sendStatsMessage` の `DataChannel.send` / `ws.send` は、チャネルが open でない状態でも呼ばれることがあり、同期例外が発生して unhandled rejection になる可能性がある。`DataChannel` / `WebSocket` の `readyState` を事前に確認し、open 状態のときだけ send するようにする。

**スコープ外 (別 issue):**

- `compressMessage` 関連すべて: issue 0040 (`Sora.getCapabilities()` API 設計) で機能検出方針に転換。0004 は close 済
- `sendAnswer` の `ws.send`: issue 0007
- `onicecandidate` 経路 (`sendSignalingMessage` 呼び出しを含むハンドラ): issue 0009。0009 が `sendSignalingMessage` を呼ぶ経路の unhandled rejection 防止は本 issue の `sendSignalingMessage` 修正でカバーする (0009 は発火源停止、本 issue は send 側の readyState ガードで二重防御、相互代替不可)

**スコープ外 (本 issue では触らない):**

- `disconnectDataChannel`: send は try/catch 済。compress 部分は issue 0040 待ち
- public `sendMessage`: async 関数の戻り Promise でそのまま呼び出し側に throw される (現状維持)
- `sendRpcMessage` 系: compress が `.then().catch()`、send が try/catch 済で防御済み
- `disconnectWebSocket`、`signalingOnMessageTypePing`、`getSignalingWebSocket` 内は別問題

## 優先度根拠

Medium。`sendSignalingMessage` / `sendStatsMessage` 経由で `DataChannel.send` / `ws.send` の同期例外が unhandled rejection になりうる。0007 / 0009 が個別に表層を塞いでも、本 issue の 2 関数から open 状態での送信漏れが残る。

## 現状

`src/base.ts` 内の `sendSignalingMessage`:

- DataChannel send に readyState チェックが無い
- ws 分岐も `this.ws !== null` のみで `readyState === 1` を見ない
- open 以外の状態で send すると同期例外が発生しうる

`sendStatsMessage` も DataChannel send に readyState チェックが無い。

行番号はソースの変動に応じてずれる可能性があるため、実装時は `sendSignalingMessage` / `sendStatsMessage` を grep して確認すること。

## 設計方針

### 共通方針

- `readyState` が open のときだけ send する
- 非 open 時は送信を skip して継続する（teardown / 切断進行中のケースを想定）
- try/catch による例外加工は避ける
- `compress === true` 分岐は本 issue では触らない。issue 0040 の機能検出設計完了後に別途扱う

### `sendSignalingMessage`

`compress === false` 経路と ws 経路を次のとおり書き換える。

```ts
if (this.soraDataChannels["signaling"]) {
  if (this.signalingOfferMessageDataChannels["signaling"]?.compress === true) {
    // compress 分岐は issue 0040 完了後に扱う。本 issue では現状維持
    const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
    const compressedMessage = await compressMessage(binaryMessage);
    this.soraDataChannels["signaling"].send(compressedMessage);
    this.writeDataChannelSignalingLog(
      `send-${message.type}`,
      this.soraDataChannels["signaling"],
      message,
    );
  } else if (this.soraDataChannels["signaling"].readyState === "open") {
    this.soraDataChannels["signaling"].send(JSON.stringify(message));
    this.writeDataChannelSignalingLog(
      `send-${message.type}`,
      this.soraDataChannels["signaling"],
      message,
    );
  }
} else if (this.ws !== null && this.ws.readyState === 1) {
  this.ws.send(JSON.stringify(message));
  this.writeWebSocketSignalingLog(`send-${message.type}`, message);
}
```

`WebSocket` の readyState は `sendAnswer` と同じく `=== 1` / `!== 1` で比較する。

**readyState skip の妥当性:** 非 open チャネルへの送信を skip して握りつぶすのは teardown / 切断進行中のケースで、ここで throw すると本 issue が防ぎたい unhandled rejection が再発する。送信失敗の検知は別経路 (ICE / WebSocket close ハンドラ) が担う。

### `sendStatsMessage`

`sendStatsMessage` は DataChannel のみを使用する。

```ts
private async sendStatsMessage(reports: RTCStatsReport[]): Promise<void> {
  if (this.soraDataChannels["stats"]) {
    const message = {
      reports,
      type: SIGNALING_MESSAGE_TYPE_STATS,
    };
    if (this.signalingOfferMessageDataChannels["stats"]?.compress === true) {
      // compress 分岐は issue 0040 完了後に扱う。本 issue では現状維持
      const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
      const compressedMessage = await compressMessage(binaryMessage);
      this.soraDataChannels["stats"].send(compressedMessage);
    } else if (this.soraDataChannels["stats"].readyState === "open") {
      this.soraDataChannels["stats"].send(JSON.stringify(message));
    }
  }
}
```

成功時ログは現状存在しないため、本 issue では新たに追加しない。

## 完了条件

### コード変更

- [ ] `sendSignalingMessage` の `compress === false` 分岐と ws 分岐に readyState ガードを入れる
- [ ] `sendStatsMessage` の DataChannel 送信箇所に readyState ガードを入れる
- [ ] `compressMessage` 関連は本 issue では触らない (issue 0040 完了後に別 issue で扱う)

### 検証

- [ ] `vp test run` が通る
- [ ] `vp build && playwright test --project='chromium'` が通る（E2E テストは CI 状況に応じてローカルで chromium プロジェクトのみ実行でよい）
- [ ] 新規テストは追加しない（対象メソッドは private で、かつ CLAUDE.md に「モックやスタブは絶対に利用しないこと」とあるため）

### 変更履歴

- [ ] `CHANGES.md` `## develop` 直下 (既存 `[FIX]` 群の後に置き、担当者行は 2 文字インデント) に追記する

  ```
  - [FIX] sendSignalingMessage / sendStatsMessage で送信前に readyState を確認し、open 以外の状態での送信を防ぐ
    - @voluntas
  ```

## 解決方法

`src/base.ts` の `sendSignalingMessage` / `sendStatsMessage` において、`DataChannel.send` / `ws.send` を呼ぶ前に `readyState` が open であることを確認するガードを追加した。

- `sendSignalingMessage`
  - `compress === false` の DataChannel 送信分岐に `readyState === "open"` ガードを追加
  - WebSocket 送信分岐に `readyState === 1` ガードを追加
  - `compress === true` 分岐は issue 0040 の機能検出設計完了後に別途扱うため、本 issue では現状維持
  - JSDoc に「compress 分岐を除き、open でない場合は送信をスキップすること」を追記
- `sendStatsMessage`
  - DataChannel 送信分岐に `readyState === "open"` ガードを追加
  - `compress === true` 分岐は `sendSignalingMessage` と同様に現状維持
  - JSDoc に「compress 分岐を除き、open でない場合は送信をスキップすること」を追記
- `CHANGES.md` の `## develop` セクションに `[FIX]` エントリを追加

## 関連 issue

- **0004 (close 済)**: `abend()` の compress 失敗対応は LBYL に方針転換
- **0040**: `Sora.getCapabilities()` API 設計 (機能検出方針)。本 issue の compress 分岐は 0040 完了後に別 issue で扱う
- **0007**: `sendAnswer` の `ws.send` 同期例外。本 issue と独立した別経路
- **0009**: `onicecandidate` ハンドラの停止。本 issue の `sendSignalingMessage` 修正と二重防御
