# connect() の失敗経路で catch した元の例外が捨てられ、原因を特定できない

- Priority: Medium
- Created: 2026-09-30
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-preserve-caught-error-on-connect
- Polished: {YYYY-MM-DD}

## 目的

`connect()` の reject から、失敗の直接原因 (WebSocket の close code / reason、`ws.send` が投げた `InvalidStateError`、signaling メッセージ処理で投げられた `SyntaxError` / `TypeError`) を取得できるようにする。現状は経路によって元の例外が SDK 内部で破棄され、利用者・保守者が原因を特定できない。

## 優先度根拠

Medium。接続失敗そのものは reject で伝わるが、原因の情報は SDK 内部で破棄されるため利用側に回避策がない。0090 で `rpc()` はサーバーのエラーを `cause` に保持する方針を採っており、connect 系だけ情報が落ちる状態は一貫していない。また 0008 (closed) が「判別が要件化された場合は別 issue で `cause` 連鎖等を検討する」として先送りした内容にあたる (参照: `issues/closed/0008-bug-fix-signaling-onmessage-exception-hangs-connect.md`, `issues/closed/0007-bug-fix-send-answer-ws-send-uncaught-exception.md`)。

## 現状

### 複数 URL 候補では、候補ごとの失敗理由が二重に捨てられる

`src/base.ts` の `getSignalingWebSocket` は複数候補のとき `testSignalingUrlCandidate` で各候補を試し、`Promise.any` の reject を次のように置き換える。

```ts
try {
  return await Promise.any(
    signalingUrlCandidates.map(async (signalingUrl) =>
      testSignalingUrlCandidate(signalingUrl),
    ),
  );
} catch {
  throw new ConnectError("Signaling failed. All signaling URL candidates failed to connect");
}
```

- `testSignalingUrlCandidate` 自身が `ws.onclose` で `reject(new Error("Signaling URL candidate WebSocket closed"))` としており、`CloseEvent` の code / reason は `writeWebSocketSignalingLog("signaling-url-candidate", { type: "close", ... })` のログにしか残らない。timeout / onerror も `new Error("Signaling URL candidate timed out")` / `new Error("Signaling URL candidate WebSocket error")` で、どの候補で何が起きたかは reject 値から読み取れない。
- さらに `catch` がバインディング無しで `AggregateError` ごと捨てるため、候補ごとの理由は reject 値から完全に失われる。

実測 (2026-09-30、dist/sora.js = 2026.2.0-canary.0、Chromium、到達できないポート 2 つを候補に指定)。

| 経路 | `message` | `code` | `reason` | `cause` |
| :--- | :--- | :--- | :--- | :--- |
| 単一 URL | `Signaling failed. CloseEventCode:1006 CloseEventReason:''` | `1006` | `""` | なし |
| 複数 URL | `Signaling failed. All signaling URL candidates failed to connect` | `undefined` | `undefined` | なし |

同じ失敗 (接続拒否) でも、`signalingUrlCandidates` を単一で指定した場合と複数で指定した場合とで得られる情報が異なる。`skills/sora-js-sdk/SKILL.md` は複数候補の指定を案内しており、到達可能な経路である。

### `sendAnswer` は `ws.send` の例外を捨てる

`src/base.ts` の `sendAnswer` は `ws.send` の同期例外をバインディング無しの `catch` で受け、固定の `ConnectError` を throw する。

```ts
try {
  this.ws.send(JSON.stringify(message));
  this.writeWebSocketSignalingLog("send-answer", message);
} catch {
  this.writeWebSocketSignalingLog("failed-to-send-answer", message);
  this.signalingTerminate();
  throw new ConnectError(
    "Signaling failed. Failed to send answer because ws.send threw",
    undefined,
    "WS_SEND_FAILED",
  );
}
```

`reason` で失敗の分類はできるが、元の例外は `cause` にも残らない。`CONNECTING` の `WebSocket` に対して `send()` を呼んだときの例外の実測 (Chromium / WebKit)。

| ブラウザ | `name` | `message` |
| :--- | :--- | :--- |
| Chromium | `InvalidStateError` | `Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.` |
| WebKit | `InvalidStateError` | `The object is in an invalid state.` |

### pre-offer の `ws.onmessage` 例外は message へ文字列連結して包み替える

`src/base.ts` の `signaling` は `ws.onmessage` 内で発生した例外を次のように包み替える。

```ts
const wrapped = new ConnectError(
  `Signaling failed. ws.onmessage threw: ${(error as Error).message}`,
  undefined,
  "SIGNALING_ONMESSAGE_EXCEPTION",
);
```

元の `Error` の `name` / `stack` / `cause` は残らず、`message` の文字列に埋め込まれるだけになる。`Error` 以外が throw された場合 (`(error as Error).message` が `undefined`) は throw された値そのものも失われる。

実測 (2026-09-30、dist/sora.js、Chromium、`type: connect` に対して壊れた JSON を返すサーバー)。

- reject 値: `ConnectError` / `message: Signaling failed. ws.onmessage threw: Unexpected token 'h', "this is not json" is not valid JSON` / `reason: "SIGNALING_ONMESSAGE_EXCEPTION"` / `cause` なし
- 元の `SyntaxError` は `name` を含めて失われている

なお `ws.onmessage` の post-offer 側 (`settled === true`) は例外をログのみで握りつぶす設計であり、本 issue の対象は pre-offer の reject 経路とする (post-offer の扱いを変えると正常接続が壊れるため)。

## 再現手順

### 手動 (Sora サーバー不要)

複数 URL 候補の全滅。誰も listen していない高位ポートを候補に指定する。

```js
const connection = Sora.connection([
  "ws://127.0.0.1:65534/signaling",
  "ws://127.0.0.1:65535/signaling",
]).recvonly("sora");
try {
  await connection.connect();
} catch (error) {
  console.log(error.name, error.message, error.code, error.reason, error.cause);
  // 現状: ConnectError "Signaling failed. All signaling URL candidates failed to connect" undefined undefined undefined
}

// 比較: 単一 URL なら同じ失敗でも close code / reason が取得できる
const single = Sora.connection("ws://127.0.0.1:65535/signaling").recvonly("sora");
try {
  await single.connect();
} catch (error) {
  console.log(error.code, error.reason);
  // 現状: 1006 ""
}
```

pre-offer の `ws.onmessage` 例外。実 Sora は常に正しい JSON を返すため、Sora を使っては再現できない。`type: connect` に対して壊れた JSON (例: `this is not json`) を返す WebSocket サーバーを立てて `connect()` すると再現できる。実測では reject 値は `ConnectError` / `reason: "SIGNALING_ONMESSAGE_EXCEPTION"` / `cause` なしで、元の `SyntaxError` の `name` は失われ、message に `Unexpected token 'h', "this is not json" is not valid JSON` が埋め込まれるだけになる。

`sendAnswer` の `ws.send` 例外。`readyState !== 1` のガードで先に `WS_SEND_INVALID_STATE` になるため、通常のブラウザ操作では `WS_SEND_FAILED` の経路に到達しない。実装時にこの分岐を純粋な処理へ切り出し、単体テストで検証する。

### E2E テストとしての再現 (2026-09-30 時点の develop で失敗することを確認済み)

複数候補の全滅は Sora サーバーもモックも不要で再現できる。`e2e-tests/` に fixture とテストを追加する (名前は例)。

fixture (`e2e-tests/connect_error_candidates/main.ts`) の要点:

```ts
const signalingUrlCandidates = new URLSearchParams(window.location.search).getAll("signalingUrl");
const connection = Sora.connection(signalingUrlCandidates).recvonly("sora");
const rejectionElement = document.querySelector<HTMLElement>("#rejection");
if (!rejectionElement) {
  return;
}

// reject 値と cause から原因特定に必要な情報を取り出す
// (Error の name / message / code / reason / cause はプロパティ参照でしか取得できない)
const describeCause = (value: unknown): unknown => {
  if (!(value instanceof Error)) {
    if (value !== null && typeof value === "object") {
      // CloseEvent などのオブジェクトから原因特定に使う値を取り出す
      const record = value as Record<string, unknown>;
      return { type: record["type"], code: record["code"], reason: record["reason"] };
    }
    return String(value);
  }
  const error = value as Error & { code?: number; reason?: string };
  const result: Record<string, unknown> = { name: error.name, message: error.message };
  if (error.code !== undefined) {
    result.code = error.code;
  }
  if (error.reason !== undefined) {
    result.reason = error.reason;
  }
  if (error.cause !== undefined) {
    result.cause = describeCause(error.cause);
  }
  if (value instanceof AggregateError) {
    result.errors = value.errors.map((e) => describeCause(e));
  }
  return result;
};

try {
  await connection.connect();
  rejectionElement.textContent = "connected";
} catch (error) {
  const connectError = error as Error & { code?: number; reason?: string };
  const result: Record<string, unknown> = {
    constructorName: connectError.constructor.name,
    isError: true,
    message: connectError.message,
    name: connectError.name,
    hasCause: connectError.cause !== undefined,
  };
  if (connectError.code !== undefined) {
    result.code = connectError.code;
  }
  if (connectError.reason !== undefined) {
    result.reason = connectError.reason;
  }
  if (connectError.cause !== undefined) {
    result.cause = describeCause(connectError.cause);
  }
  rejectionElement.textContent = "rejected";
  rejectionElement.dataset.rejection = JSON.stringify(result);
}
```

テスト (`e2e-tests/tests/connect_error_candidates.test.ts`):

```ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";

// 誰も listen していないポートを確保する (実サーバーを立てて閉じるだけで、モックは使わない)
const reserveClosedPort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  return address.port;
};

test("複数 URL 候補の全滅時に connect() の reject から候補ごとの失敗理由を取得できる", async ({
  browser,
}) => {
  const ports = [await reserveClosedPort(), await reserveClosedPort()];
  const query = ports
    .map((port) => `signalingUrl=${encodeURIComponent(`ws://127.0.0.1:${port}/signaling`)}`)
    .join("&");
  const page = await browser.newPage();
  await page.goto(`http://localhost:9000/connect_error_candidates/?${query}`);
  await page.click("#connect");
  await page.waitForSelector("#rejection:not(:empty)", { timeout: 10000 });
  const rejection = JSON.parse((await page.getAttribute("#rejection", "data-rejection")) ?? "{}");
  console.log(`reject=${JSON.stringify(rejection)}`);

  expect(rejection["name"]).toBe("ConnectError");
  // 候補ごとの close code を cause から取得できること
  expect(rejection["hasCause"]).toBe(true);
  expect(JSON.stringify(rejection["cause"])).toContain("1006");
  await page.close();
});
```

実行: `vp exec playwright test --project=Chromium --retries=0 e2e-tests/tests/connect_error_candidates.test.ts` (playwright.config.ts の `webServer` が `e2e-dev` を起動する)

現状の結果 (実測。`constructorName` が `"_"` なのは dist ビルドでクラス名が minify されるため)。

```text
reject={"constructorName":"_","isError":true,"message":"Signaling failed. All signaling URL candidates failed to connect","name":"ConnectError","hasCause":false}

    Error: expect(received).toBe(expected) // Object.is equality
    Expected: true
    Received: false
    > expect(rejection["hasCause"]).toBe(true);
```

このテストは現状では失敗するため、そのまま develop に入れると E2E の CI が赤くなる。修正 PR で追加する (先にテストを入れる場合は Playwright の `test.fail()` を付けておき、修正時に外す)。

## 設計方針

- `src/utils.ts` の `ConnectError` に `Error` の `cause` を持たせる (`Error` の options 経由)。既存の 3 引数呼び出しの挙動 (`name` / `code` / `reason`) は変えない。
- `testSignalingUrlCandidate` の reject 値を、失敗種別 (timeout / close / error) が分かるエラーに変える。close の場合は `CloseEvent` の code / reason を保持し、ログにしか残らない状態を解消する。
- `getSignalingWebSocket` の `catch` はバインディングを取り、元のエラー (`AggregateError` を含む) を `cause` に保持する。候補が複数ある場合は単一の `code` / `reason` に畳めないため、候補ごとの理由を `cause` から取得できることを要件とする。
- `sendAnswer` の `catch` はバインディングを取り、元の例外を `cause` に保持する (`reason: "WS_SEND_FAILED"` は維持)。
- `signaling` の pre-offer ラップは `(error as Error).message` を前提にせず、`Error` 以外の値でも内容が残るようにする (`cause` に元の値を保持する。`message` の文言は既存の `"Signaling failed. ws.onmessage threw: ..."` を維持してよい)。
- 0074 (WebSocket シグナリングログの形式統一) と 0081 (接続確立前の失敗を伝える契約の明文化と `ConnectError` の export 可否) の結論は本 issue に持ち込まない。本 issue は「捨てられている原因情報を reject 値から取得できるようにする」ことに限定する。

## 完了条件

- 複数 URL 候補で全候補が失敗したとき、`connect()` の reject の `cause` から候補ごとの失敗理由 (少なくとも close code / reason と、timeout / onerror の区別) を取得できる
- `ws.send` が同期例外を投げたとき、reject 値の `cause` に元の例外が入っている
- pre-offer の `ws.onmessage` 例外で、reject 値の `cause` に元の値が入っている (`Error` 以外が throw された場合も値が残る)
- 単一 URL 経路の `ConnectError.code` / `ConnectError.reason` と、既存の `reason` の値 (`WS_SEND_FAILED` / `SIGNALING_ONMESSAGE_EXCEPTION`) が変わっていない
- `ConnectError` の constructor に `cause` を渡せることと、`AggregateError` から reject 値を組み立てる処理の単体テストが追加されている
- 再現手順に記載した E2E テストが `e2e-tests/` に追加され、通ること
- `vp test run` / `vp check` / `vp exec tsc --noEmit` が通る
- `CHANGES.md` の `## develop` に `[FIX]` が追記されている

テスト戦略: `ConnectError` の constructor と、`AggregateError` から `cause` を組み立てる処理は純粋な処理として単体テストできる。`getSignalingWebSocket` の複数候補経路は、再現手順に記載した E2E テスト (到達できないポートを候補にした接続) で検証する。`sendAnswer` の `ws.send` 例外は `readyState` のガードがあるため通常は到達せず、`signaling` の pre-offer 例外は壊れた応答を返すサーバーが必要なため、どちらも実装の分岐を純粋な処理へ切り出して単体テストで検証する (モック・スタブは利用しない)。

## 解決方法

完了時に記載する。
