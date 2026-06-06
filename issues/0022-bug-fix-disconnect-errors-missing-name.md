# `errors.ts` の Disconnect 系エラークラスが `this.name` を設定せず識別不能

- Priority: Low
- Created: 2026-05-21
- Polished: 2026-06-02
- Model: Opus 4.7
- Branch: feature/fix-disconnect-errors-name

## 目的

`src/errors.ts` の `DisconnectWaitTimeoutError` / `DisconnectInternalError` / `DisconnectDataChannelError` は `super("...")` のみで `this.name` を設定しておらず `error.name` が `"Error"` のまま。各 constructor で `this.name` をクラス名に設定し、エラー種別を識別可能にする。0021 (`ConnectError` の `name` 設定) と方針を揃える内部一貫性の改善。

## 必要性

**必要だが優先度は低い** (確信度: 高)。`src/errors.ts` の 3 クラスは `this.name` 未設定。ただし、これらのインスタンスは現状 **利用者にもモニタリングにも届かない**。`src/base.ts` での使われ方:

- `DisconnectInternalError` (`src/base.ts:938`): `new DisconnectInternalError().message` で `.message` 文字列だけ取り出し `reason` に格納。インスタンスは破棄。
- `DisconnectWaitTimeoutError` (`src/base.ts:944`) / `DisconnectDataChannelError` (`src/base.ts:963`): `reject(new ...)` するが、reject 先は `disconnectDataChannel` 内の `Promise.race` の catch で `(error as Error).message` だけを取り出し `reason` に詰める。Error インスタンス自体は外に出ない。

さらに 3 クラスは `src/sora.ts` の公開 export に含まれず、利用者は `instanceof` も使えない。したがって `name` 設定で現状の利用者観測値 (最終的に届く `SoraCloseEvent.reason` の文字列) は変わらない。

## 優先度根拠

Low。0021 の `ConnectError` は `connect()` の reject としてインスタンスが利用者に届くため `name` 設定に実利があるが、本 issue の 3 クラスはインスタンスが内部で `.message` 抽出後に破棄され利用者へ届かないため、現状のモニタリング識別に効果はない。価値は (1) 将来 SDK がこれらのインスタンスをログ出力するようになった場合の保険、(2) 0021 の `ConnectError` と揃える内部コード一貫性、に限る。現状観測可能な挙動は変わらないため Low、CHANGES は後方互換のある `[UPDATE]`。

## 現状

```ts
// src/errors.ts (3 クラスとも同型)
export class DisconnectWaitTimeoutError extends Error {
  constructor() {
    super("DISCONNECT-WAIT-TIMEOUT-ERROR");
  }
}
```

`message` 文字列 (`"DISCONNECT-WAIT-TIMEOUT-ERROR"` 等) は既存値を維持し、`this.name` のみクラス名に設定する。

## 設計方針

各 constructor で `super(...)` の後に `this.name = "<クラス名>"` を追加する。`Object.setPrototypeOf` は付けない (tsconfig の `target` は ES2022 でネイティブ class 継承により `instanceof` は正しく動く。既存 `errors.ts` および 0021 の `ConnectError` とも統一する)。

```ts
export class DisconnectWaitTimeoutError extends Error {
  constructor() {
    super("DISCONNECT-WAIT-TIMEOUT-ERROR");
    this.name = "DisconnectWaitTimeoutError";
  }
}

export class DisconnectInternalError extends Error {
  constructor() {
    super("DISCONNECT-INTERNAL-ERROR");
    this.name = "DisconnectInternalError";
  }
}

export class DisconnectDataChannelError extends Error {
  constructor() {
    super("DISCONNECT-DATA-CHANNEL-ERROR");
    this.name = "DisconnectDataChannelError";
  }
}
```

### テスト (`tests/errors.test.ts` 新規)

3 クラスとも `name` / `message` / `instanceof`（各クラスおよび `Error`）を検証する。`message` 不変は `base.ts:938/1027` 経由で `reason` へ伝播する値の不変を担保する。

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
  expect(e instanceof Error).toBe(true);
});

test("DisconnectDataChannelError の name / message / instanceof", () => {
  const e = new DisconnectDataChannelError();
  expect(e.name).toBe("DisconnectDataChannelError");
  expect(e.message).toBe("DISCONNECT-DATA-CHANNEL-ERROR");
  expect(e instanceof DisconnectDataChannelError).toBe(true);
  expect(e instanceof Error).toBe(true);
});
```

### CHANGES.md

```
- [UPDATE] DisconnectWaitTimeoutError / DisconnectInternalError / DisconnectDataChannelError の constructor で name プロパティを設定するようにする
  - @voluntas
```

## スコープ外

- `ConnectError` (`src/utils.ts`) — issue 0021
- `ConnectError` を `errors.ts` へ集約するリファクタ
- `message` 文字列の変更

## マージ順

issue 0021 とファイルが異なりコンフリクトしない。任意順で単独マージ可。リポジトリ全体の正本チェーンは issue 0004 を参照 (本 issue は独立)。

## 完了条件

- `src/errors.ts` の 3 クラスすべての constructor に `this.name = "<クラス名>"` を追加する (`setPrototypeOf` は追加しない)
- `message` 文字列は維持する (`base.ts:938/1027` 経由で `reason` へ伝播する値が不変であること)
- `tests/errors.test.ts` (新規) で各クラスの `name` / `message` / `instanceof`（クラス・`Error`）を assert する
- ローカルで `pnpm test` が通ること
- CHANGES.md `## develop` に `[UPDATE]` エントリを追記する (`error.name` が `"Error"` → クラス名。利用者観測値は不変のため後方互換あり)
