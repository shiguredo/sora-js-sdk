# shutdown() が WebSocket を close() せず参照だけ外す

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-shutdown-leaves-websocket
- Polished: {YYYY-MM-DD}

## 目的

DataChannel の type `close` で `shutdown()` したとき、残っているシグナリング WebSocket を `close()` する。アプリには切断済みと見えているのにソケットだけが生き、後から届く `onclose` が次の接続を切らないようにする。

## 優先度根拠

Medium。`ignore_disconnect_websocket` が false の switched では WebSocket が残る。その状態で signaling DataChannel に type `close` が届くと、`shutdown()` は `this.ws = null` にするだけで `close()` も `onclose` の解除もしない。遅れて届く `onclose` は `monitorWebSocketEvent` のハンドラのままなので、同じインスタンスの新しい接続に対して `shutdown()` か `abend()` を呼ぶ。

`issues/closed/0001-bug-fix-redirect-old-ws-onmessage-not-cleared.md` は `ignore_disconnect_websocket: true` のときハンドラを外して `close()` する。false のときに type `close` で参照だけ外す経路は対象外である。

## 現状

`ConnectionBase.signalingOnMessageTypeClose` は `shutdown()` だけを呼ぶ。`shutdown()` は DataChannel と PeerConnection を閉じ、`initializeConnection` で `this.ws = null` にする。`WebSocket.close()` は呼ばない。`onclose` / `onmessage` / `onerror` も外さない。

`ConnectionBase.signalingOnMessageTypeSwitched` は `ignore_disconnect_websocket` が true のときだけハンドラを外して `close()` する。false のときは `monitorWebSocketEvent` の `onclose` が残る。

`abend()` は `disconnectWebSocket` で WebSocket を閉じる。同じサーバー起点の終了でも、`shutdown()` だけがソケットを放置する。

## 設計方針

`shutdown()` は `initializeConnection` で参照を消す前に、残っている WebSocket の `onmessage` / `onerror` を外し、`onclose` はログ専用にするか外したうえで `close()` する。後から届く `onclose` は、その時点の `this.ws` が別インスタンスなら `shutdown()` も `abend()` も呼ばない。

`ignore_disconnect_websocket: true` で switched 時にすでに閉じている経路は変えない。`issues/pending/0030-refactor-abend-shutdown-idempotency.md` の 4 系統統合は本 issue で行わない。

## 完了条件

- `signalingSwitched === true` かつ WebSocket が残っている状態で type `close` を受けると、その WebSocket が `close()` される
- その `onclose` が、再接続後の `this.ws` に対して `shutdown()` または `abend()` を呼ばない
- `ignore_disconnect_websocket: true` の switched で既に WebSocket を閉じているときは、二重 close で例外にならない
- `callbacks.disconnect` は type `close` に対して 1 回である
