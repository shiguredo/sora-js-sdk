# RPCError を新設してサーバーが返した RPC エラーを instanceof で判別できるようにする

- Priority: Low
- Created: 2026-09-18
- Completed: {YYYY-MM-DD}
- Branch: feature/add-rpc-error-class
- Polished: {YYYY-MM-DD}

## 目的

0090 で `rpc()` はサーバーの JSON-RPC エラーを `Error` の `cause` に保持するようになるが、呼び出し側は `cause` の有無とキャストでしか扱えず、型付きのアクセスも `instanceof` による判別もできない。`code` / `data` を型付きで持つ `RPCError` を公開し、サーバーが返したエラーを第一級に扱えるようにする。

## 優先度根拠

Low。0090 で不具合 (エラーの内容が取得できない) は解消するため、本 issue は利便性の改善であり急ぎではない。`Error.cause` の型は `unknown` なので、利用側は `error.cause as JSONRPCErrorResponse["error"]` のようなキャストを書く必要がある。

## 現状

本 issue は 0090 の対応を前提とする。

- 0090 の対応後、`rpc()` が reject する値は plain な `Error` で、サーバーが返した `{ code, message, data }` は `cause` に入る。
- サーバーが返したエラーかどうかの判別は `error.cause` の有無という暗黙の契約に依存する。将来クライアント側のエラーが `cause` を使うと判別が壊れる。
- `src/errors.ts` には `DisconnectWaitTimeoutError` / `DisconnectInternalError` / `DisconnectDataChannelError` があるが、いずれも `src/sora.ts` からは公開されておらず、SDK 利用者が `instanceof` で扱えるエラークラスは現状存在しない。

## 設計方針

- `src/errors.ts` に `RPCError extends Error` を追加する。`message` は JSON-RPC の `message`、`code` / `data` はプロパティとして保持し、`name` は `"RPCError"` にする。
- `cause` には 0090 と同じく JSON-RPC エラーオブジェクトを設定し、`cause` を参照している呼び出し側を壊さない。
- `handleRPCResponse` のエラー経路で `RPCError` を reject する。`Error` を継承するため `instanceof Error` は真のままで、0090 で定めた契約 (`Error` インスタンスで reject する) は維持される。
- `src/sora.ts` から `RPCError` を re-export する。`src/errors.ts` のクラスを公開するのはこれが初めてになるため、公開 API の追加として `[ADD]` で扱う。
- クライアント側のエラー (`RPC DataChannel is not available or not open`、`RPC request timeout: <method>`、notification 送信時の例外) は plain な `Error` のままとする。これにより `instanceof RPCError` がサーバーが返したエラーの判別として機能する。
- `skills/sora-js-sdk/SKILL.md` の RPC 節に `RPCError` を追記する。
- `CHANGES.md` の `## develop` に `[ADD]` を追記する。

## 完了条件

- サーバーが JSON-RPC エラーを返したとき、`error instanceof RPCError` が真になる
- `error.code` / `error.message` / `error.data` に型付きでアクセスできる
- `error instanceof Error` が真のままである (0090 の契約を維持)
- `error.cause` に JSON-RPC エラーオブジェクトが引き続き入っている
- クライアント側のエラーでは `error instanceof RPCError` が偽になる
- `RPCError` が `src/sora.ts` から re-export されている
- `RPCError` の組み立てを検証する単体テストが追加されている
- `skills/sora-js-sdk/SKILL.md` の RPC 節に `RPCError` が追記されている
- `vp test run` / `vp check` / `vp exec tsc --noEmit` が通る
- `CHANGES.md` の `## develop` に `[ADD]` が追記されている

テスト戦略: jsdom に `RTCDataChannel` が無いため DataChannel 経由の reject は単体テストで再現できないが、`RPCError` の組み立ては JSON-RPC エラーオブジェクトを渡す純粋な処理として検証できる。
