# RPCError を新設してサーバーが返した RPC エラーを instanceof で判別できるようにする

- Priority: Low
- Created: 2026-09-18
- Completed: {YYYY-MM-DD}
- Branch: feature/add-rpc-error-class
- Polished: 2026-10-19

## 目的

0090 で `rpc()` はサーバーの JSON-RPC エラーを `Error` の `cause` に保持するようになったが、呼び出し側は `cause` の有無とキャストでしか `code` / `data` を扱えず、`instanceof` による判別もできない。`code` / `data` を型付きで持つ `RPCError` を公開し、サーバーが返したエラーを第一級に扱えるようにする。

## 優先度根拠

Low。0090 で不具合 (エラーの内容が取得できない) は解消したため、本 issue は利便性の改善であり急ぎではない。`Error.cause` の型は `unknown` なので、利用側は `error.cause as JSONRPCErrorResponse["error"]` のようなキャストを書く必要がある。

## 現状

本 issue は 0090 の対応を前提とする。0090 は完了済みである。

- 0090 の対応後、`rpc()` が reject する値は、サーバーが JSON-RPC 2.0 に適合するエラーオブジェクトを返した場合は plain な `Error` で、`message` はサーバーの `message`、`cause` にはサーバーが返した JSON-RPC エラーオブジェクト (`code` / `message` / 任意の `data`) が入る。サーバーがオブジェクト以外の `error` を返した場合は `String(error)` を `message` にした plain な `Error` で、`cause` は設定されない。`message` が文字列でないオブジェクトの場合は `JSON.stringify(error)` を `message` にした plain な `Error` で、`cause` にオブジェクトを保持する。
- サーバーが返したエラーかどうかの判別は、`rpc()` の TSDoc と `skills/sora-js-sdk/SKILL.md` に明記された「`cause` が設定されていればサーバーが返したエラー」という契約に依存する。将来クライアント側のエラーが `cause` を使うと判別が壊れる。
- `src/errors.ts` には `DisconnectWaitTimeoutError` / `DisconnectInternalError` / `DisconnectDataChannelError` があるが、いずれも `src/sora.ts` からは公開されておらず、SDK 利用者が `instanceof` で扱えるエラークラスは現状存在しない。

## 設計方針

- `src/errors.ts` に `RPCError extends Error` を追加する。constructor は `JSONRPCErrorResponse["error"]` (`{ code, message, data }`) を 1 引数で受け取り、`super(error.message, { cause: error })` で `message` と `cause` を設定する。`code` / `data` はプロパティとして保持し、`name` は `"RPCError"` にする。`data` が無い場合は `undefined` を保持する。
- `cause` には 0090 と同じく JSON-RPC エラーオブジェクトを設定し、`cause` を参照している呼び出し側を壊さない。
- `handleRPCResponse` のエラー経路で `RPCError` を reject する。`Error` を継承するため `instanceof Error` は真のままである。ただし 0090 の完了条件で定めた「plain な `Error` / `name` は `"Error"`」という契約は、サーバーが JSON-RPC 2.0 に適合するエラーオブジェクトを返した場合に限り `RPCError` に置き換わる。それを検証・記載している `tests/utils.test.ts` / `e2e-tests/rpc` / `src/base.ts` の TSDoc / `skills/sora-js-sdk/SKILL.md` を `RPCError` に合わせて更新する。`tests/errors.test.ts` には `RPCError` の組み立てを検証する単体テストを追加する。
- サーバーが JSON-RPC 2.0 に反する値 (`null` / `undefined` / 文字列など) を返した場合は、0090 と同じく `String(error)` を `message` にした plain な `Error` で reject し、`cause` を設定しない。`message` が文字列でないオブジェクトの場合は、0090 と同じく `JSON.stringify(error)` を `message` にした plain な `Error` で `cause` にオブジェクトを保持する。`RPCError` の constructor にそのまま渡すと `null` / `undefined` では `TypeError` になり Promise が未解決のまま残り、文字列などでは `code` を持たない不正な `RPCError` になるため、`createErrorFromJSONRPCError` のオブジェクト以外と `message` が文字列でないオブジェクトの分岐は維持する。
- `createErrorFromJSONRPCError` は、`error` が `null` 以外のオブジェクトで `message` が文字列かつ `code` が数値の場合は `RPCError` を返す。`null` 以外のオブジェクトで `message` が文字列だが `code` が数値でない場合は、0090 と同じく `message` をそのまま `Error` の message にした plain な `Error` で `cause` にオブジェクトを保持する。`null` 以外のオブジェクトで `message` が文字列でない場合は `JSON.stringify(error)` を message にした plain な `Error`、`null` またはオブジェクト以外の場合は `String(error)` を message にした plain な `Error` とする。`handleRPCResponse` は引き続きこの関数を呼ぶ。これにより 0090 で追加した「JSON-RPC 2.0 に反する値でも settle する」挙動を維持する。`src/utils.ts` の `createErrorFromJSONRPCError` の TSDoc も、適合するエラーオブジェクトでは `RPCError` を返し、それ以外は 0090 と同じ plain な `Error` を返す旨に更新する。0095 の切断時エラーはこの関数を通らないため、`createErrorFromJSONRPCError` の変更はサーバーが返したエラー経路だけに影響する。
- `src/sora.ts` から `RPCError` を re-export する。`src/errors.ts` のクラスを公開するのはこれが初めてになるため、公開 API の追加として `[ADD]` で扱う。サーバーが返すエラーのクラスが plain な `Error` から `RPCError` に変わるため、`CHANGES.md` には `[CHANGE]` も追記する。
- クライアント側のエラー (`RPC DataChannel is not available or not open`、`RPC request timeout: <method>`、notification 送信時の例外、0095 の切断時エラーなど) は plain な `Error` のままとする。これにより `instanceof RPCError` がサーバーが返したエラーの判別として機能する。
- `src/base.ts` の `rpc()` の TSDoc を、サーバーがエラーを返した場合は `RPCError` で reject し、`instanceof RPCError` で判別できる旨に更新する。`cause` の契約と、JSON-RPC 2.0 に反する値の場合は plain な `Error` になる旨も維持する。
- `skills/sora-js-sdk/SKILL.md` の RPC 節を、`RPCError` を `import { RPCError } from "sora-js-sdk";` で import し、`error instanceof RPCError` で判別する例に更新する。既存の「plain な `Error`」「`cause` のキャスト」の記述は残さない。
- `e2e-tests/rpc/main.ts` / `e2e-tests/tests/rpc.test.ts` / `e2e-tests/tests/helper.ts` のサーバーエラー経路の検証を、`RPCError` の `instanceof` / `name` / `code` / `message` / `data` / `cause` を確認する内容に更新する。クライアント側のエラーが plain な `Error` のままであることも維持する。`NPM_PKG_E2E_TEST` のサーバーエラー経路は、公開済みパッケージに `RPCError` が含まれないためスキップしたままにし、スキップ理由の文言も `RPCError` が含まれないことに合わせる。`e2e-tests/rpc/main.ts` は `RPCError` を静的に import すると `NPM_PKG_E2E_TEST` の公開済みパッケージでページの読み込みが失敗するため、`import * as SoraSDK from "sora-js-sdk"` のように namespace import し、`SoraSDK.RPCError` が関数として存在する場合だけ `instanceof` を評価する。存在しない場合は `isRPCError` を false にする。
- `CHANGES.md` の `## develop` に `[CHANGE]` → `[ADD]` の順で追記する。

## 完了条件

- サーバーが JSON-RPC 2.0 に適合するエラーオブジェクトを返したとき、`error instanceof RPCError` が真になる
- `error.code` は `number`、`error.message` は `string`、`error.data` は `unknown` としてアクセスできる
- `error instanceof Error` が真のままである
- `error.cause` に JSON-RPC エラーオブジェクトが引き続き入っている
- サーバーが JSON-RPC 2.0 に反する値 (`null` / `undefined` / 文字列など) を返したとき、`error instanceof RPCError` は偽で、`String(error)` を `message` にした plain な `Error` になり、`cause` は設定されない
- JSON-RPC 2.0 に適合しないオブジェクト (`message` が文字列でない、`code` が数値でない) は `RPCError` にならず、0090 と同じ plain な `Error` で `cause` に保持される
- クライアント側のエラーでは `error instanceof RPCError` が偽になる
- `RPCError` が `src/sora.ts` から re-export されている
- `tests/errors.test.ts` に `RPCError` の組み立てを検証する単体テストが追加されている (`name` / `message` / `code` / `data` / `cause` / `instanceof RPCError` / `instanceof Error`、`data` が無い場合)
- `createErrorFromJSONRPCError` の既存テストが、適合するエラーオブジェクトでは `RPCError` を返し、JSON-RPC 2.0 に反する値では plain な `Error` を返すことに合わせて更新されている
- `e2e-tests/rpc/main.ts` / `e2e-tests/tests/rpc.test.ts` / `e2e-tests/tests/helper.ts` のサーバーエラー経路のテストが `RPCError` に合わせて更新され、クライアント側のエラーが plain な `Error` のままであることを検証している
- `src/base.ts` の `rpc()` の TSDoc が `RPCError` に合わせて更新されている
- `src/utils.ts` の `createErrorFromJSONRPCError` の TSDoc が、`RPCError` を返す場合と plain な `Error` を返す場合を区別する内容に更新されている
- `skills/sora-js-sdk/SKILL.md` の RPC 節が `RPCError` に合わせて更新されている
- `vp test run` / `vp check` / `vp exec tsc --noEmit` / `vp run build` が通る
- `e2e-tests/rpc` のテストが通る
- `NPM_PKG_E2E_TEST` の公開済みパッケージでも `e2e-tests/rpc` のページが読み込め、クライアント側のエラーのテストが通る
- `CHANGES.md` の `## develop` に `[CHANGE]` → `[ADD]` の順で追記されている

テスト戦略: jsdom に `RTCDataChannel` が無いため DataChannel 経由の reject は単体テストで再現できないが、`RPCError` の組み立ては JSON-RPC エラーオブジェクトを渡す純粋な処理として検証できる。`handleRPCResponse` が `RPCError` を reject すること、クライアント側のエラーが plain な `Error` のままであること、`cause` が維持されることは `e2e-tests/rpc` の E2E テスト (`e2e-tests/tests/rpc.test.ts`) で検証する。JSON-RPC 2.0 に反する値の扱いは `createErrorFromJSONRPCError` の単体テストで検証する。
