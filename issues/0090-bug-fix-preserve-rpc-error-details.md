# rpc() がサーバーの JSON-RPC エラーを Error("[object Object]") に潰すため code / message / data を取得できない

- Priority: High
- Created: 2026-09-18
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-preserve-rpc-error-details
- Polished: 2026-09-18

## 目的

RPC でサーバーが JSON-RPC エラーを返したとき、呼び出し側が `code` / `message` / `data` を取得できるようにする。現状は SDK 内部で `Error("[object Object]")` に潰され、エラーの内容が失われる。

## 優先度根拠

High。RPC の失敗経路のうち「サーバーがエラーを返す」ケースで、エラーの内容が一切取得できなくなる。JSON-RPC 2.0 のエラーレスポンスは `code` / `message` を必須、`data` を任意で持つ仕様であり、呼び出し側はこれを使って分岐・リトライ・通知を判断する。情報は SDK 内部で破棄されるため呼び出し側に回避策が無い。実際に sora-devtools 2026.1.0 の RPC タブでは、Call 時に `[object Object]` のアラートが表示され、RPC Results にもエラーの内容が残らない状態になっている。

## 現状

### エラー経路

- `src/base.ts` の `ConnectionBase.handleRPCResponse` は `"error" in response` のときに `promise.reject(response.error)` を呼び、JSON-RPC エラーオブジェクト (`{ code, message, data }`) をそのまま渡す。
- `src/base.ts` の `ConnectionBase.rpc` が `rpcRequestPromises` に登録する reject は `reject(reason instanceof Error ? reason : new Error(String(reason)))` であり、オブジェクトは `Error(String(reason))` に包まれる。`String({ ... })` は `"[object Object]"` になるため、呼び出し側が受け取るのは `Error("[object Object]")` になる。

### 問題点

- サーバーが返した `code` / `message` / `data` が失われ、呼び出し側はエラーの種別を判別できない。
- 包まれた結果 `error instanceof Error` は真になるため、呼び出し側は「クライアント側のエラー (DataChannel 未接続、タイムアウト等)」と「サーバーが返したエラー」を区別することもできない。
- 2025.2.0 では `reject(reason)` と素通しだった。`9a9d6a29` (oxlint のルール設定整備に伴う `Promise.reject` に Error を渡す修正) で包み込みが入り、`CHANGES.md` に記載されないまま挙動が変わっている。

### 再現手順

1. RPC が有効な接続で、サーバーが JSON-RPC エラーを返す呼び出しを行う
2. `rpc()` が `Error("[object Object]")` で reject する
3. `error.message` は `"[object Object]"`、`error.code` / `error.data` は `undefined` になる

## 設計方針

- `src/base.ts` の `ConnectionBase.handleRPCResponse` で、`response.error` をそのまま reject せず `new Error(response.error.message, { cause: response.error })` を reject する。`message` はサーバーが返した `message` になり、`cause` に `{ code, message, data }` が保持される。
- reject される値は 2026.1.0 と同じ plain な `Error` インスタンスのままとする (`name` は `"Error"`、`instanceof Error` は真)。新しいエラークラスの新設と re-export は公開 API の追加 (`[ADD]`) になるため本 issue には含めず、別 issue (0091) で扱う。
- 呼び出し側の判別は `error.cause` の有無で行う。この契約 (サーバーがエラーを返した場合のみ `cause` に JSON-RPC エラーオブジェクトが入る) を TSDoc に明記する。クライアント側のエラー (DataChannel 未接続、タイムアウト、notification 送信失敗) には `cause` を設定しない。
- `cause` を設定するのは `handleRPCResponse` のエラー経路のみとし、`rpc()` の reject ラッパー (`reject(reason instanceof Error ? reason : new Error(String(reason)))`) の汎用の包み込みは変更しない。
- JSON-RPC エラーオブジェクトから `Error` を組み立てる処理は `src/utils.ts` の純粋な関数として切り出し、`RTCDataChannel` を使わずに単体テストできるようにする。
- `rpc()` の reject の型は `unknown` のまま変更しない。TSDoc に、サーバーがエラーを返した場合は `cause` に `JSONRPCErrorResponse["error"]` が入ることを追記する。
- `skills/sora-js-sdk/SKILL.md` の RPC 節にエラー時の `cause` を追記する。
- `CHANGES.md` の `## develop` に `[FIX]` を追記する (公開 API の追加が無いため `[ADD]` は含めない)。

## 完了条件

- サーバーが JSON-RPC エラーを返したとき、`rpc()` が reject する `Error` の `message` がサーバーの `message` になる
- `error.cause` から `code` / `message` / `data` を取得できる
- reject される値が plain な `Error` インスタンスで、`error.name` が `"Error"`、`error instanceof Error` が真になる (2026.1.0 と同じ契約)
- サーバーがエラーを返した場合のみ `cause` が設定され、クライアント側のエラーでは設定されない
- export が増えていない (公開 API の追加が無い)
- クライアント側のエラー (DataChannel 未接続、タイムアウト、notification 送信失敗) の挙動が変わっていない
- 成功時の `result` の扱いと `rpcMethods` が変わっていない
- `e2e-tests/rpc` に、サーバーがエラーを返す呼び出しで `code` / `message` / `data` (Sora が返す実値) と plain な `Error` の契約、RPC ログへの出力を検証する経路が追加されている
- `e2e-tests/rpc` に、成功時に `rpc()` が解決する `result` の内容を検証する経路が追加されている
- `skills/sora-js-sdk/SKILL.md` の RPC 節にエラー時の `cause` が追記されている
- `vp test run` / `vp check` / `vp exec tsc --noEmit` が通る
- `CHANGES.md` の `## develop` に `[FIX]` が追記されている

テスト戦略: jsdom に `RTCDataChannel` が無く、AGENTS.md でモック・スタブも禁止されているため、DataChannel 経由の reject は単体テストでは再現できない。`e2e-tests/rpc` の E2E テストで次を検証する。

- サーバーが返す JSON-RPC エラーの `code` / `message` / `data` が `cause` から取得でき、`message` がサーバーの `message` になること (期待値は Sora が実際に返す値に合わせる)
- reject される値が plain な `Error` インスタンスであること
- エラーの内容が RPC ログに出力されること
- 成功時に `rpc()` が解決する `result` の内容

これにより「`handleRPCResponse` のエラー経路が変換処理を呼ぶこと」と「reject ラッパーが `Error` を再包装しないこと」も併せて検証できている。どちらが壊れても `message` と `cause` の実値の一致で失敗するためである。
