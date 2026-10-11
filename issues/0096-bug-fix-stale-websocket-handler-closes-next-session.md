# 失敗または切断後の WebSocket ハンドラが次の接続を閉じる

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-stale-websocket-handler-closes-next-session
- Polished: 2026-10-12

## 目的

接続に失敗したソケット、または切断済みのソケットに残った `onclose` が、同じ Connection で張り直した `this.ws` を `close()` しないようにする。

## 優先度根拠

High。サイマルキャスト非対応ブラウザで `simulcast: true` にした失敗のあと再接続すると、古いソケットの close が新しいセッションを `signalingTerminate()` で破棄する。`disconnect()` の直後の再接続でも、遅れて届く `onclose` が新しい WebSocket を閉じる。

`issues/pending/0043-bug-fix-signaling-terminate-leaks-ws-handlers.md` は、`signalingTerminate()` が `this.ws` の `onmessage` / `onerror` を外さない問題である。本 issue は、`this.ws` に代入する前の失敗と、`disconnectWebSocket` がイベント対象ではなく `this.ws` を閉じる問題であり、0043 では塞がらない。

## 現状

`ConnectionBase.signaling` は `onclose` / `onmessage` を付けたあと `createSignalingMessage` を呼ぶ。throw 時は `reject` して return するだけで、`ws.close()` も `this.ws = ws` もしない。`onclose` は `settled` を見ずに `this.signalingTerminate()` を呼ぶ。`createSignalingMessage` が throw するのは、未知の role、`channelId` が `null` / `undefined`、`recvonly` 以外でサイマルキャスト非対応のときである。`dataChannels` の要素が object でないときも `parseDataChannelConfiguration` が throw する。

`ws.send` が `this.ws = ws` より前に throw した場合も、ハンドラが残ったまま Promise が reject される。

`ConnectionBase.disconnectWebSocket` の `onclose` は、イベントの target ではなく `this.ws` を `close()` して null にする。`readyState === 1` でない分岐は `close()` の完了を待たずに `this.ws = null` して resolve する。タイムアウト分岐も `close()` と `this.ws = null` のあとハンドラを外さない。ブラウザが `onclose` を遅らせているあいだに次の `connect()` が `this.ws` を代入すると、古いソケットのハンドラが新しいソケットを閉じる。

## 設計方針

`createSignalingMessage` または `ws.send` が失敗したとき、その WebSocket の `onclose` / `onmessage` / `onerror` を外してから `close()` する。外したあとの close イベントでは `signalingTerminate()` を呼ばない。失敗したソケットはその場で `close()` するため `this.ws = ws` の代入は行わない (代入は現状どおり `ws.send` の成功後)。

`disconnectWebSocket` の `onclose` は、ハンドラを付けたソケット自身だけを閉じる。`this.ws` が別インスタンスなら触らない。`close()` して resolve する経路では、遅延 `onclose` が後続の接続を閉じないようにハンドラを外す。

0043 の `signalingTerminate()` 内のハンドラ解除は本 issue で変更しない。

## 完了条件

- `createSignalingMessage` が throw したとき、その WebSocket が close され、後から届く `onclose` が `signalingTerminate()` を呼ばない
- `disconnectWebSocket` のあと、古いソケットの `onclose` が新しい `this.ws` を `close()` しない
- `ws.send` が throw したときも、その WebSocket が close され、後から届く `onclose` が `signalingTerminate()` を呼ばない
- 失敗したソケットが open のまま残らない
