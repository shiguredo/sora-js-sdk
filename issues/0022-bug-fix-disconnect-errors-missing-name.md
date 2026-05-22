# `errors.ts` の Disconnect 系エラークラスが `this.name` を設定せず識別不能

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-disconnect-errors-name

## 目的

`src/errors.ts` の `DisconnectWaitTimeoutError` / `DisconnectInternalError` / `DisconnectDataChannelError` は `super("...")` のみ呼んで `this.name` を設定していない。`error.name` は `Error` の既定値 `"Error"` のままで、minify / transpile / モジュールバンドルを経由するとクラス名が `r1` / `s2` のような短縮形に変わるため `instanceof` も実装によっては不安定になる。本番モニタリング (Sentry / Datadog / CloudWatch) で 3 種類のエラーが同一 `"Error"` グループに集約され、障害切り分けが不可能になる。

各 constructor で `this.name` を該当クラス名で設定し、`Object.setPrototypeOf(this, new.target.prototype)` を呼んで transpile 後の prototype chain を整える。

## 優先度根拠

High。本番モニタリングで切断種別の分類ができなくなり、障害発生時の初動対応が遅れる。issue 0021 (`ConnectError` の constructor 整備) と同じ対策で、Error 継承クラス全体の質を底上げする。

## 現状

`src/errors.ts:1-21`

```ts
// 切断待機タイムアウトエラー
export class DisconnectWaitTimeoutError extends Error {
  constructor() {
    super("DISCONNECT-WAIT-TIMEOUT-ERROR");
  }
}

// 内部エラー
export class DisconnectInternalError extends Error {
  constructor() {
    super("DISCONNECT-INTERNAL-ERROR");
  }
}

// DataChannel onerror によるエラー
export class DisconnectDataChannelError extends Error {
  constructor() {
    super("DISCONNECT-DATA-CHANNEL-ERROR");
  }
}
```

`this.name` の代入が無いため `error.name === "Error"`。`Object.setPrototypeOf` も呼ばれていないため、TypeScript の `target: "ES5"` 等で transpile されると `instanceof` が壊れる可能性がある (TypeScript Handbook の Extending Built-ins の制約)。本リポジトリは TypeScript 6.0、`target: "ES2022"` (`tsconfig.json` で確認) なので modern target では `instanceof` は通常壊れないが、依存パッケージ側で旧 target に transpile される可能性を考えると defensive に `Object.setPrototypeOf` を入れておくべき。

`ConnectError` (`src/utils.ts:414-417`) は issue 0021 で constructor を導入する予定で、同じパターン (`this.name = "ConnectError"; Object.setPrototypeOf(this, ConnectError.prototype);`) を採用する。本 issue は `errors.ts` の 3 クラスにも同じパターンを適用する。

将来的には `ConnectError` を `errors.ts` に移動して全 Error クラスを 1 ファイルに集約する選択肢もあるが、本 issue では各ファイルの場所はそのまま (`ConnectError` は `utils.ts`、Disconnect 系は `errors.ts`) にする。集約リファクタは別 issue として扱う。

## 完了条件

- `src/errors.ts:1-21` の 3 クラスそれぞれの constructor で `this.name = "<クラス名>";` と `Object.setPrototypeOf(this, <クラス名>.prototype);` を追加する
- 単体テストを `tests/errors.test.ts` (新規) に追加し、3 クラスそれぞれで次を assert する
  - `error.name === "<クラス名>"` (例: `"DisconnectWaitTimeoutError"`)
  - `error.message === "<既存メッセージ>"` (例: `"DISCONNECT-WAIT-TIMEOUT-ERROR"`)
  - `error instanceof <クラス>` が `true`
  - `error instanceof Error` が `true`
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [CHANGE] DisconnectWaitTimeoutError / DisconnectInternalError / DisconnectDataChannelError の constructor で name プロパティを設定するようにする
    - @voluntas
  ```
  既存挙動が `error.name === "Error"` から `error.name === "<クラス名>"` に変わるため `[CHANGE]` とする。アプリ側で `error.name === "Error"` での分岐をしている場合は影響するが、現実的にはほぼないため互換性影響は軽微
- `ConnectError` の `errors.ts` への移動など Error クラス全体の集約リファクタは本 issue では行わない。本 issue 着手前に `issues/SEQUENCE` から 1 つ採番して別 issue 雛形を作成し `SEQUENCE` を +1 する
- マージ順は issue 0021 と独立。0022 / 0021 はそれぞれ別ファイル (`errors.ts` / `utils.ts`) を編集するためコンフリクトしない

## 解決方法

`src/errors.ts:1-21` を次の通り書き換える。

```ts
// 切断待機タイムアウトエラー
export class DisconnectWaitTimeoutError extends Error {
  constructor() {
    super("DISCONNECT-WAIT-TIMEOUT-ERROR");
    this.name = "DisconnectWaitTimeoutError";
    Object.setPrototypeOf(this, DisconnectWaitTimeoutError.prototype);
  }
}

// 内部エラー
export class DisconnectInternalError extends Error {
  constructor() {
    super("DISCONNECT-INTERNAL-ERROR");
    this.name = "DisconnectInternalError";
    Object.setPrototypeOf(this, DisconnectInternalError.prototype);
  }
}

// DataChannel onerror によるエラー
export class DisconnectDataChannelError extends Error {
  constructor() {
    super("DISCONNECT-DATA-CHANNEL-ERROR");
    this.name = "DisconnectDataChannelError";
    Object.setPrototypeOf(this, DisconnectDataChannelError.prototype);
  }
}
```

`tests/errors.test.ts` (新規) に次のテストを追加する。

```ts
import { describe, expect, test } from "vitest";
import {
  DisconnectDataChannelError,
  DisconnectInternalError,
  DisconnectWaitTimeoutError,
} from "../src/errors";

describe("Disconnect 系エラークラス", () => {
  test("DisconnectWaitTimeoutError の name / instanceof が正しい", () => {
    const e = new DisconnectWaitTimeoutError();
    expect(e.name).toBe("DisconnectWaitTimeoutError");
    expect(e.message).toBe("DISCONNECT-WAIT-TIMEOUT-ERROR");
    expect(e instanceof DisconnectWaitTimeoutError).toBe(true);
    expect(e instanceof Error).toBe(true);
  });

  test("DisconnectInternalError の name / instanceof が正しい", () => {
    const e = new DisconnectInternalError();
    expect(e.name).toBe("DisconnectInternalError");
    expect(e.message).toBe("DISCONNECT-INTERNAL-ERROR");
    expect(e instanceof DisconnectInternalError).toBe(true);
    expect(e instanceof Error).toBe(true);
  });

  test("DisconnectDataChannelError の name / instanceof が正しい", () => {
    const e = new DisconnectDataChannelError();
    expect(e.name).toBe("DisconnectDataChannelError");
    expect(e.message).toBe("DISCONNECT-DATA-CHANNEL-ERROR");
    expect(e instanceof DisconnectDataChannelError).toBe(true);
    expect(e instanceof Error).toBe(true);
  });
});
```
