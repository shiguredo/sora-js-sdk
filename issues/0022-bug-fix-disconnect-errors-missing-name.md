# `errors.ts` の Disconnect 系エラークラスが `this.name` を設定せず識別不能

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-disconnect-errors-name

## 目的

`src/errors.ts` の `DisconnectWaitTimeoutError` / `DisconnectInternalError` / `DisconnectDataChannelError` は `super("...")` のみで `this.name` を設定していない。`error.name` は `"Error"` のままで、Sentry / Datadog / CloudWatch 等で 3 種類が同一グループに集約される。各 constructor で `this.name` と `Object.setPrototypeOf` を設定する。

## 必要性

**必要** (確信度: 高)。`src/errors.ts:1-21` に未設定の 3 クラスが残存。`DisconnectWaitTimeoutError` は `src/base.ts:944` で使用されている。

## 優先度根拠

High。本番モニタリングで切断種別の分類ができず、障害初動が遅れる。issue 0021 (`ConnectError`) と同型の対策。

## 現状

```ts
// src/errors.ts:1-21
export class DisconnectWaitTimeoutError extends Error {
  constructor() {
    super("DISCONNECT-WAIT-TIMEOUT-ERROR");
  }
}
// DisconnectInternalError / DisconnectDataChannelError も同型
```

`message` 文字列 (例: `"DISCONNECT-WAIT-TIMEOUT-ERROR"`) は既存値を維持する。`this.name` のみクラス名に変更する。

## 設計方針

```ts
export class DisconnectWaitTimeoutError extends Error {
  constructor() {
    super("DISCONNECT-WAIT-TIMEOUT-ERROR");
    this.name = "DisconnectWaitTimeoutError";
    Object.setPrototypeOf(this, DisconnectWaitTimeoutError.prototype);
  }
}

export class DisconnectInternalError extends Error {
  constructor() {
    super("DISCONNECT-INTERNAL-ERROR");
    this.name = "DisconnectInternalError";
    Object.setPrototypeOf(this, DisconnectInternalError.prototype);
  }
}

export class DisconnectDataChannelError extends Error {
  constructor() {
    super("DISCONNECT-DATA-CHANNEL-ERROR");
    this.name = "DisconnectDataChannelError";
    Object.setPrototypeOf(this, DisconnectDataChannelError.prototype);
  }
}
```

### テスト (`tests/errors.test.ts` 新規)

```ts
import {
  DisconnectDataChannelError,
  DisconnectInternalError,
  DisconnectWaitTimeoutError,
} from "../src/errors";

test("DisconnectWaitTimeoutError の name / message / instanceof", () => {
  const e = new DisconnectWaitTimeoutError();
  expect(e.name).toBe("DisconnectWaitTimeoutError");
  expect(e.message).toBe("DISCONNECT-WAIT-TIMEOUT-ERROR");
  expect(e instanceof DisconnectWaitTimeoutError).toBe(true);
  expect(e instanceof Error).toBe(true);
});

test("DisconnectInternalError の name / message / instanceof", () => {
  const e = new DisconnectInternalError();
  expect(e.name).toBe("DisconnectInternalError");
  expect(e.message).toBe("DISCONNECT-INTERNAL-ERROR");
  expect(e instanceof DisconnectInternalError).toBe(true);
});

test("DisconnectDataChannelError の name / message / instanceof", () => {
  const e = new DisconnectDataChannelError();
  expect(e.name).toBe("DisconnectDataChannelError");
  expect(e.message).toBe("DISCONNECT-DATA-CHANNEL-ERROR");
  expect(e instanceof DisconnectDataChannelError).toBe(true);
});
```

### CHANGES.md

```
- [CHANGE] DisconnectWaitTimeoutError / DisconnectInternalError / DisconnectDataChannelError の constructor で name プロパティを設定するようにする
  - @voluntas
```

## スコープ外

- `ConnectError` (`src/utils.ts`) — issue 0021
- `ConnectError` を `errors.ts` へ集約するリファクタ
- `message` 文字列の変更

## マージ順

issue 0021 とファイルが異なりコンフリクトしない。**任意順で単独マージ可**。0004 チェーン (`0004 → 0006 → 0021 → 0009 → 0007`) とは独立。

## 完了条件

- `src/errors.ts:1-21` の 3 クラスすべてに `name` / `setPrototypeOf` を追加する
- `tests/errors.test.ts` (新規) で各クラスの `name` / `message` / `instanceof` を assert する
- ローカルで `pnpm test` が通ること
- CHANGES.md `## develop` に `[CHANGE]` エントリを追記する (`error.name` が `"Error"` → クラス名)
