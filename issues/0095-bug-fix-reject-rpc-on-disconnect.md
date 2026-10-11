# 切断後も rpc() の Promise が決着しない

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-reject-rpc-on-disconnect
- Polished: 2026-10-12

## 目的

`disconnect()` / `abend()` / `abendPeerConnectionState()` / `shutdown()` / `signalingTerminate()` で接続が終わったとき、未完了の `rpc()` を reject する。`timeout` を渡していない呼び出しが、DataChannel が閉じたあとも `await` のまま残らないようにする。

## 優先度根拠

High。`ConnectionBase.rpc` のタイムアウトは `options.timeout` を渡したときだけである。切断は RPC の終端条件になっておらず、呼び出し側の `await rpc()` が接続より長く生き残る。

## 現状

`ConnectionBase.rpc` は通常リクエストの Promise を `rpcRequestPromises` に登録する。この Map から Promise を外して reject するのは、`handleRPCResponse`、送信失敗、`options.timeout` の発火だけである。

`initializeConnection` は `sessionId` や `pc` は消すが、`rpcRequestPromises` も `rpcRequestIdCounter` も触らない。`disconnect()` / `abend()` / `abendPeerConnectionState()` / `shutdown()` / `signalingTerminate()` も pending を reject しない。切断処理は DataChannel を閉じるため、応答が後から `handleRPCResponse` に届く保証も無い。

`timeout` を付けた呼び出しは、切断時にタイマーを解除せず、RPC タイムアウトとして後から reject される。タイムアウト後も、圧縮完了後の `send` は止まらない。

## 設計方針

接続を終わらせる経路は `disconnect()` / `abend()` / `abendPeerConnectionState()` / `shutdown()` / `signalingTerminate()` の 5 つである。各経路の冒頭 (最初の `await` より前) で、残っている `rpcRequestPromises` を reject して Map を空にする。`initializeConnection()` にはまとめない。`disconnect()` の DataChannel 経由の切断では全 DataChannel が閉じるまで待つ間も `onmessage` が残っており、応答が先に届けば `handleRPCResponse` が resolve して「応答前に切断されると reject する」を満たせないためである。各経路の冒頭で reject すれば、切断後に応答が届いても resolve しない。reject 理由はクライアント側のエラーとし、`cause` は付けない。サーバーが返した JSON-RPC エラーと区別できるようにする。既存の `createErrorFromJSONRPCError` の契約は変えない。

`issues/pending/0030-refactor-abend-shutdown-idempotency.md` は `abend()` / `abendPeerConnectionState()` / `shutdown()` / `disconnect()` の 4 系統を `runShutdownOnce` に統合する予定だが、`signalingTerminate()` は connect-time クリーンアップとして対象外である。本 issue では `signalingTerminate()` も含む 5 経路を対象とする。

各エントリのタイムアウトタイマーも同時に解除する。通常リクエストでは、reject または `options.timeout` の発火でエントリが Map から消えた場合、後から圧縮が完了しても `send` しない。圧縮完了時点でエントリが Map に残っている場合だけ `send` する (notification は Map に登録しないため対象外)。

`rpcRequestIdCounter` は再接続でもリセットしない。ID の衝突は起きない。古いエントリを Map に残さないことが本 issue の完了条件である。

## 完了条件

- `timeout` 無しの `rpc()` が応答前に `disconnect()` されると reject し、切断後に応答が届いても resolve しない
- `abend()` / `abendPeerConnectionState()` / `shutdown()` / `signalingTerminate()` でも同じように reject する
- reject 後に `rpcRequestPromises` が空である
- 切断後に圧縮が完了しても RPC DataChannel へ `send` しない
- `options.timeout` 発火後も、圧縮が完了しても RPC DataChannel へ `send` しない
- サーバーが返したエラーを `createErrorFromJSONRPCError` で reject する経路は変えない
- `issues/0091-add-rpc-error-class.md` の `RPCError` とは別である。本 issue の切断時エラーは `RPCError` にしない
