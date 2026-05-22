# `sendAnswer` の `ws.send` 同期例外がアンキャッチで内部リソースが残る

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-send-answer-ws-send-exception

## 目的

`sendAnswer` (`src/base.ts:1507-1515`) が `this.ws.send(JSON.stringify(message))` を try/catch せず同期呼び出ししているため、`ws.readyState !== 1` 時に `InvalidStateError` が同期 throw され、呼び出し元の `multiStream` (`src/publisher.ts` / `src/subscriber.ts` / `src/messaging.ts`) が reject する。`multiStream(...).finally(...)` で `clearConnectionTimeout` / `clearMonitorSignalingWebSocketEvent` は呼ばれるが、`signalingTerminate` 相当のクリーンアップ (ws / pc / dataChannel の close と `initializeConnection`) は走らないため、`this.ws` / `this.pc` / `this.soraDataChannels` が dangling 状態で残る。即座にアプリが `connect()` を再試行すると残骸を踏んで状態破壊が連鎖する (issue 0011 の interval 孤児化と相関)。

`sendAnswer` の同期 throw を try/catch で囲み、失敗時に `signalingTerminate()` を呼んで内部状態を初期化してから throw し直す。

## 優先度根拠

High。`createAnswer` 直後に Sora 側 TCP RST、ローカルネットワーク変動、`monitorSignalingWebSocketEvent` の close 検知レースなどで `ws.readyState` が `OPEN` 以外になっているケースが本番で発生しうる。発生すると `connect()` が reject するが、SDK 内部状態は中途半端なまま残るため、ユーザーが catch して再 `connect()` を呼ぶと「前回の残骸が干渉して再接続できない」状態になる。

## 現状

`src/base.ts:1507-1515`

```ts
protected sendAnswer(): void {
  if (this.pc && this.ws && this.pc.localDescription) {
    this.trace("ANSWER SDP", this.pc.localDescription.sdp);
    const { sdp } = this.pc.localDescription;
    const message = { sdp, type: SIGNALING_MESSAGE_TYPE_ANSWER };
    this.ws.send(JSON.stringify(message));
    this.writeWebSocketSignalingLog("send-answer", message);
  }
}
```

`ws.send` は `readyState !== 1` 時に `InvalidStateError` を同期 throw する。`sendAnswer` は `void` 同期メソッドで、呼び出し元 `multiStream` (例: `src/publisher.ts` の `multiStream` 内 `this.sendAnswer();`) でも try/catch されていない。同期 throw は `multiStream` が返す Promise の reject となり、`Promise.race` の prevent / `finally` 経由で `clearConnectionTimeout` / `clearMonitorSignalingWebSocketEvent` は呼ばれるが、`signalingTerminate` は呼ばれず `this.ws` / `this.pc` / `this.soraDataChannels` が初期化されないまま残る。

`sendUpdateAnswer` (`src/base.ts:1916-1924`) と `sendReAnswer` (`src/base.ts:1929-1937`) は async メソッドで、`this.ws.send` を直接呼ばず `this.sendSignalingMessage(...)` (`src/base.ts:2301-2322`) を介する。`sendSignalingMessage` の内部にも `this.soraDataChannels.signaling.send` と `this.ws.send` の try/catch 漏れがあるが、これは issue 0004 の完了条件で先行採番される `sendSignalingMessage` の `compressMessage` 失敗を扱う同型バグ雛形に統合して扱うため、本 issue の対象外とする。同様に `sendStatsMessage` (`src/base.ts:2329-2343`)、public API `sendMessage` (`src/base.ts:2428` 周辺) も本 issue の対象外。

`signalingTerminate` (`src/base.ts:582-598`) は冪等な作りになっており、内部の `ws.close()` / `pc.close()` / `dataChannel.close()` はすべて null/falsy ガード付きで二重呼び出しに安全。`initializeConnection` (`src/base.ts:820-848`) も冪等。

## 完了条件

- `sendAnswer` (`src/base.ts:1507-1515`) が `this.ws.send` を try/catch で囲み、catch 時に `signalingTerminate()` を呼んでから例外を再 throw する
- catch 時の throw は `Error` ではなく `ConnectError` を使い、`reason: "WS_SEND_INVALID_STATE"` 相当のフィールドを設定する。SDK が他経路で投げる `ConnectError` と統一する
- `this.ws.readyState !== 1` の早期検出を `try` の前に挿入し、`ws.send` を呼ばずに `signalingTerminate()` + throw する経路を持つ。`readyState` が `CLOSING` / `CLOSED` で `ws.send` が同期 throw する仕様だが、明示することで実装意図を読み取りやすくする
- 既存ログ呼び出し `this.trace("ANSWER SDP", ...)` (`src/base.ts:1509`) と `this.writeWebSocketSignalingLog("send-answer", message)` (`src/base.ts:1513`) を保持する。失敗経路では `this.writeWebSocketSignalingLog("failed-to-send-answer", { reason: errorMessage })` 相当のログを残す
- 検証は実機 Sora で `ws.readyState !== 1` を狙って起こすのが難しい (TCP RST タイミング依存) ため、コードレビューで try/catch の到達性を担保する。手動検証手順を `e2e-tests/sendrecv/README.md` (もしくは新規 README) に「`signalingNotifyMetadata` 周りの認証エラーで Sora が close frame を返してきた直後に `sendAnswer` が走る場合」のような再現条件として残す
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] sendAnswer の ws.send が同期 throw したときに内部状態がクリーンアップされなかったのを修正する
    - @voluntas
  ```
- 本 issue は issue 0002 (`disconnect()` 冪等化) および issue 0011 (`monitorSignalingWebSocketEvent` の interval 孤児化) と並行で進められる。`signalingTerminate` 内部のタイマークリーンアップは issue 0011 で強化する別件のため、本 issue は `sendAnswer` の例外伝播パス整備のみに集中する

## 解決方法

`src/base.ts:1507-1515` の `sendAnswer` を次の通り書き換える。

```ts
protected sendAnswer(): void {
  if (this.pc && this.ws && this.pc.localDescription) {
    this.trace("ANSWER SDP", this.pc.localDescription.sdp);
    const { sdp } = this.pc.localDescription;
    const message = { sdp, type: SIGNALING_MESSAGE_TYPE_ANSWER };
    if (this.ws.readyState !== 1) {
      const error = new ConnectError(
        "Signaling failed. WebSocket is not open when sending answer.",
      );
      error.reason = "WS_SEND_INVALID_STATE";
      this.writeWebSocketSignalingLog("failed-to-send-answer", {
        reason: error.reason,
      });
      this.signalingTerminate();
      throw error;
    }
    try {
      this.ws.send(JSON.stringify(message));
      this.writeWebSocketSignalingLog("send-answer", message);
    } catch (e) {
      const errorMessage = (e as Error).message;
      this.writeWebSocketSignalingLog("failed-to-send-answer", {
        reason: errorMessage,
      });
      this.signalingTerminate();
      const error = new ConnectError(
        `Signaling failed. ws.send failed: ${errorMessage}`,
      );
      error.reason = "WS_SEND_FAILED";
      throw error;
    }
  }
}
```

`ConnectError` は `src/utils.ts:414-417` で定義されており `code?: number` / `reason?: string` を持つ。`error.reason = "WS_SEND_INVALID_STATE"` / `"WS_SEND_FAILED"` の代入は既存シグネチャと整合する。

`sendUpdateAnswer` / `sendReAnswer` / `sendSignalingMessage` / `sendStatsMessage` / public `sendMessage` の修正は本 issue では行わない。issue 0004 で先行採番される同型バグ雛形 (`sendSignalingMessage` の `compressMessage` 失敗、ws.send / DC.send 同期 throw を含む) で扱う。
