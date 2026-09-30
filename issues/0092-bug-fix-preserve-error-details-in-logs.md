# timeline / signaling イベントと DataChannel 失敗ログでエラーの name / code / reason が失われる

- Priority: Medium
- Created: 2026-09-30
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-preserve-error-details-in-logs
- Polished: {YYYY-MM-DD}

## 目的

SDK がエラーを timeline / signaling イベントやログとして外部へ出すとき、`Error` の `name` / `code` / `reason` が欠落して原因を特定できない問題を解消する。表示側が参照できる情報が SDK の出力に残っていないという点で、sora-devtools で発生した「`getUserMedia` の `OverconstrainedError` がエラーポップアップに何も表示されない」問題と同じ型の不具合である。

## 優先度根拠

Medium。接続の成否には影響しないが、障害調査の一次情報が欠落し、利用側に回避策がない。

- `timeline` / `signaling` イベントは sora-devtools などが原因表示に使う一次情報である。`ConnectError` を data に渡している経路では `name` が `"Error"` に化け、`code` / `reason` が消える。同じ失敗が `connect()` の reject では `code` / `reason` 付きで取得できるため、SDK 内部で情報が落ちていると言える。
- 同じ `onclose` イベントでも経路によって data の形が変わり、解析側で統一的に扱えない。
- DataChannel の send 失敗ログは `message` しか記録しないため、WebKit のように message が汎用的な文言しか返さない環境では例外の種別すら残らない。

## 現状

### timeline / signaling イベントの data は structuredClone で複製される

`src/utils.ts` の `createTimelineEvent` / `createSignalingEvent` は data を `structuredClone` で複製する。

```ts
const event = new Event(eventType) as TimelineEvent;
// data をコピーする
try {
  event.data = structuredClone(data);
} catch {
  event.data = data;
}
```

`src/base.ts` の `getSignalingWebSocket` / `signaling` / `monitorSignalingWebSocketEvent` は `ws.onclose` で組み立てた `ConnectError` を `writeWebSocketTimelineLog("onclose", error)` に渡し、`monitorSignalingWebSocketEvent` の `ws.onerror` は `writeWebSocketSignalingLog("onerror", error)` に渡す。

`src/utils.ts` の `ConnectError` は `name` / `code` / `reason` を own property として持つが、HTML の structured clone は Error オブジェクトを `name` / `message` / `stack` / `cause` だけを持つ `Error` として複製するため、次が失われる。

- `code` / `reason` (own property) は複製されない
- `name` は標準の Error 名 (`Error` / `TypeError` など) 以外だと `"Error"` に置き換えられる
- 複製後のプロトタイプは `Error.prototype` になり `instanceof ConnectError` も偽になる

`message` (と `stack`。複製されることは Chromium で確認) は残るため、message にコードと理由を埋め込んでいる close 経路では文字列から読み取れるが、機械的に参照できる `code` / `reason` は失われる。

### 実測 (2026-09-30、dist/sora.js = 2026.2.0-canary.0、Chromium / WebKit)

到達できないポートへ `connect()` して失敗させ、`on("timeline")` で受け取った `onclose` イベントを調べた結果。

| 対象 | `constructor.name` | `name` | `message` | `code` | `reason` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `connect()` の reject (`ConnectError`) | `ConnectError` | `"ConnectError"` | `Signaling failed. CloseEventCode:1006 CloseEventReason:''` | `1006` | `""` |
| timeline の `onclose` イベント data | `Error` | `"Error"` | `Signaling failed. CloseEventCode:1006 CloseEventReason:''` | `undefined` | `undefined` |

`structuredClone` の挙動は Chromium / WebKit の両方で同じであることを確認している (Error 派生 + own property のオブジェクトを複製すると `name` が `"Error"` になり own property は消える)。

### 同じ onclose でも data の形が経路で異なる

`src/base.ts` の `abend` / `monitorWebSocketEvent` / `disconnectWebSocket` は同じ `onclose` に `{ code, reason }` の plain object を渡しており、上記の `ConnectError` を渡す経路と data の形が異なる。

### DataChannel send 失敗ログは message のみ

`src/base.ts` の `abend` と `disconnectDataChannel` は DataChannel `send` の失敗を次の形でログに記録する (計 4 箇所)。

```ts
} catch (error) {
  const errorMessage = (error as Error).message;
  this.writeDataChannelSignalingLog(
    "failed-to-send-disconnect",
    this.soraDataChannels["signaling"],
    errorMessage,
  );
}
```

`RTCDataChannel` を close して `send()` を呼んだときの実測 (Chromium / WebKit)。

| ブラウザ | `name` | `message` |
| :--- | :--- | :--- |
| Chromium | `InvalidStateError` | `Failed to execute 'send' on 'RTCDataChannel': RTCDataChannel.readyState is not 'open'` |
| WebKit | `InvalidStateError` | `The object is in an invalid state.` |

WebKit では記録された message から例外の種別が分からない。

## 再現手順

### 手動 (Sora サーバー不要)

1. `vp pack` で `dist/sora.js` をビルドし、SDK を読み込んだページをブラウザで開く
2. 誰も listen していないポートへ `connect()` する (Chrome がブロックする低位ポートを避けて高位ポートを使う)

```js
const connection = Sora.connection("ws://127.0.0.1:65535/signaling").recvonly("sora");
connection.on("timeline", (event) => {
  if (event.type !== "onclose") {
    return;
  }
  const data = event.data;
  // name / message / code / reason はプロパティ参照でしか取得できない
  // (JSON.stringify は "{}"、Object.keys とスプレッドは [] になる)
  console.log(data.constructor.name, data.name, data.code, data.reason);
  // 現状: Error Error undefined undefined
  // 期待: ConnectError ConnectError 1006 ""
});
try {
  await connection.connect();
} catch (error) {
  console.log(error.name, error.code, error.reason);
  // 現状: ConnectError 1006 "" (同じ失敗が reject では取得できる)
}
```

### E2E テストとしての再現 (2026-09-30 時点の develop で失敗することを確認済み)

Sora サーバーもモックも不要で、到達できないポートへ接続するだけで再現できる。`e2e-tests/` に fixture とテストを追加する (名前は例)。

fixture (`e2e-tests/connect_error_timeline/main.ts`) の要点:

```ts
const signalingUrl = new URLSearchParams(window.location.search).get("signalingUrl") ?? "";
const connection = Sora.connection(signalingUrl).recvonly("sora");
const oncloseEvents: Array<Record<string, unknown>> = [];
connection.on("timeline", (event) => {
  if (event.type !== "onclose") {
    return;
  }
  const data = event.data as (Error & { code?: number; reason?: string }) | undefined;
  oncloseEvents.push({
    constructorName: data?.constructor?.name,
    name: data?.name,
    message: data?.message,
    code: data?.code ?? null,
    reason: data?.reason ?? null,
    ownKeys: data === undefined ? null : Object.keys(data),
  });
});
try {
  await connection.connect();
} catch {
  // reject 側は別途確認する
}
const timelineElement = document.querySelector<HTMLElement>("#timeline");
if (timelineElement) {
  timelineElement.dataset.onclose = JSON.stringify(oncloseEvents);
}
```

テスト (`e2e-tests/tests/connect_error_timeline.test.ts`):

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

test("接続失敗時の timeline onclose イベント data から name / code / reason を取得できる", async ({
  browser,
}) => {
  const port = await reserveClosedPort();
  const page = await browser.newPage();
  await page.goto(
    `http://localhost:9000/connect_error_timeline/?signalingUrl=${encodeURIComponent(
      `ws://127.0.0.1:${port}/signaling`,
    )}`,
  );
  await page.click("#connect");
  await page.waitForSelector("#timeline:not(:empty)", { timeout: 10000 });
  const oncloseEvents = JSON.parse((await page.getAttribute("#timeline", "data-onclose")) ?? "[]");
  console.log(`timelineOnclose=${JSON.stringify(oncloseEvents)}`);

  expect(oncloseEvents).toHaveLength(1);
  expect(oncloseEvents[0]).toMatchObject({ name: "ConnectError", code: 1006, reason: "" });
  await page.close();
});
```

実行: `vp exec playwright test --project=Chromium --retries=0 e2e-tests/tests/connect_error_timeline.test.ts` (playwright.config.ts の `webServer` が `e2e-dev` を起動する)

現状の結果 (実測)。reject 側には情報が残るが、timeline イベント側だけが失われる (`constructorName` が `"_"` なのは dist ビルドでクラス名が minify されるため)。

```text
reject={"constructorName":"_","isError":true,"message":"Signaling failed. CloseEventCode:1006 CloseEventReason:''","name":"ConnectError","code":1006,"reason":"","hasCause":false}
timelineOnclose=[{"constructorName":"Error","name":"Error","message":"Signaling failed. CloseEventCode:1006 CloseEventReason:''","code":null,"reason":null,"ownKeys":[]}]

- Expected  - 3
+ Received  + 3
  Object {
-   "code": 1006,
-   "name": "ConnectError",
-   "reason": "",
+   "code": null,
+   "name": "Error",
+   "reason": null,
  }
```

このテストは現状では失敗するため、そのまま develop に入れると E2E の CI が赤くなる。修正 PR で追加する (先にテストを入れる場合は Playwright の `test.fail()` を付けておき、修正時に外す)。

## 設計方針

- `src/utils.ts` に、`unknown` からエラー詳細の plain object (`{ name, message, code?, reason? }`) を組み立てる内部ヘルパを追加する。`Error` 以外が throw された場合も `String(value)` を message にして情報を捨てない。
- `writeWebSocketTimelineLog("onclose", error)` と `writeWebSocketSignalingLog("onerror", error)` は `Error` をそのまま渡さず、上記ヘルパの結果を渡す。timeline / signaling イベントはログ用途であり、公開 API の型 (`TimelineEvent.data` / `SignalingEvent.data` は `unknown`) は変更しない。
- 同じ `onclose` イベントの data の形を経路ごとに変えない。形式そのものの統一は 0074 が扱うため、本 issue では「どの形を採るにしても、その経路のエラー詳細が data から取得できること」を満たす。
- DataChannel send 失敗ログは `name` と `message` の両方が記録されるようにする (文字列のままなら `${name}: ${message}`、plain object にするなら `name` / `message` を持つ形)。
- `ConnectError` を export するかどうかは 0081 の判断に従い、本 issue では変更しない。

## 完了条件

- 単一 URL 経路で `connect()` が失敗したとき、`timeline` の `onclose` イベント data から `name` / `message` / `code` / `reason` を取得できる
- `signaling` の `onerror` イベント data から `name` / `message` を取得できる
- 同じ `onclose` の data の形が単一 URL 経路と `abend` 経路で揃っている (0074 の結論に従う。0074 が未着手の場合は詳細が失われない形になっていればよい)
- DataChannel send 失敗ログに `name` と `message` の両方が含まれる
- `Error` 以外の値が throw された場合もログに値が残る (message が `undefined` にならない)
- `TimelineEvent` / `SignalingEvent` の型と公開 API に変更が無い
- 追加したヘルパの単体テストが追加されている (`Error` / `DOMException` / `Error` 以外の値)
- 再現手順に記載した E2E テストが `e2e-tests/` に追加され、通ること
- `vp test run` / `vp check` / `vp exec tsc --noEmit` が通る
- `CHANGES.md` の `## develop` に `[FIX]` が追記されている

テスト戦略: `createTimelineEvent` / `createSignalingEvent` と追加するヘルパは jsdom 上で実行できるため、`Error` / `DOMException` / 文字列を渡したときに data が詳細を保持することは単体テストで検証できる。WebSocket の `onclose` から `ConnectError` が組み立てられる経路は、再現手順に記載した E2E テスト (到達できないポートへの接続) で検証する。

## 解決方法

完了時に記載する。
