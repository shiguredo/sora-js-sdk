# signalingTerminate() が DataChannel の onclose を外さずに close() し、次の接続を disconnect() する

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-signaling-terminate-datachannel-onclose
- Polished: 2026-10-12

## 目的

`signalingTerminate()` が DataChannel を閉じるとき、`onclose` が後から `disconnect()` を呼ばないようにする。接続失敗のあとで始まった次の `connect()` を、遅延した `onclose` が破棄しないようにする。

## 優先度根拠

Medium。answer 後に DataChannel が開いた状態で接続タイムアウトや `sendAnswer` 失敗が起きると、`close()` の `onclose` は非同期で届く。そのハンドラは `disconnect()` であり、その時点の `this.ws` と `this.pc` を切断する。

`issues/pending/0043-bug-fix-signaling-terminate-leaks-ws-handlers.md` は WebSocket の `onmessage` / `onerror` を対象にしており、DataChannel の `onclose` は含まない。

## 現状

`ConnectionBase.signalingTerminate` は `soraDataChannels` の各チャネルを `close()` してから Map から消す。`onclose` / `onerror` / `onmessage` は外さない。

`onDataChannel` が付けた `onclose` は `disconnect()`、`onerror` は `abend()` を呼ぶ。`abend` / `shutdown` / `disconnectDataChannel` / `forceCloseDataChannels` は閉じる前にハンドラを外すか、ログ専用に差し替える。`signalingTerminate` だけが外さない。

`close()` の `onclose` は、Map から消したあとに届く。届いた時点の Connection が次の接続なら、その `disconnect()` が新しいセッションを切る。

## 設計方針

`signalingTerminate` は `close()` の前に、各 DataChannel の `onclose` / `onerror` / `onmessage` を外す。ログ専用の `onclose` を残すかどうかは `shutdown` に揃える。後から届くイベントで `disconnect()` も `abend()` も呼ばない。

0043 の WebSocket ハンドラ解除は本 issue の完了条件に含めない。同じ関数を触るため、0043 が先に入った場合は DataChannel 側の解除だけを追加する。

## 完了条件

- `signalingTerminate()` のあと、対象 DataChannel の `onclose` が `disconnect()` を呼ばない
- `onerror` が `abend()` を呼ばない
- answer 後の接続失敗に続いて `connect()` したとき、前の DataChannel の `onclose` で新しい `this.pc` が close されない
- `shutdown()` / `disconnect()` が閉じる前にハンドラを外す既存の動作は維持する
