# `ConnectError` の constructor を `(message, code?, reason?)` に拡張し後付け代入を廃止する

- Priority: Medium
- Created: 2026-05-21
- Completed: 2026-06-10
- Polished: 2026-06-10
- Model: Opus 4.7
- Branch: feature/refactor-connect-error-constructor

## 目的

`ConnectError` (`src/utils.ts:414-422`) は 1 引数 constructor `(message?: string)` のみを持ち、`code` / `reason` フィールドは constructor 引数で受け取れない。そのため `src/base.ts` の 3 箇所 (`:1154-1155`, `:1279-1280`, `:1618-1619`) で `new ConnectError(...)` の直後に `error.code = event.code` / `error.reason = event.reason` の後付け代入が残っている。constructor を `(message: string, code?: number, reason?: string)` に拡張し、`code` / `reason` も constructor 引数で初期化することで、後付け代入を全廃する。あわせて `message` を `string?` から `string` (必須) に格上げする。

本変更は後続 issue 0007 / 0008 / 0012 が `new ConnectError("...", undefined, "REASON_CODE")` 形式の constructor 呼び出しを前提に設計されているため、それらの先行整備として必要。

## 優先度根拠

Medium。本変更自体の利用者観測値は変わらず実害は現状ない。一方で後続 issue 0007 (High) / 0008 (High) / 0012 (Low) が `reason` 分類コードを constructor 引数で導入する前提となるため、後続 issue 実装の直前までにマージしておく必要がある。最優先 (High) ではないが優先的に対応すべき位置付け。

## 現状

### 問題のコード

`src/utils.ts:414-422` (`e5eaba02` (2026-06-09、PR `#719` の一部) で 1 引数 constructor と `this.name = "ConnectError"` 設定が導入された後の現状):

```ts
export class ConnectError extends Error {
  code?: number;
  reason?: string;

  constructor(message?: string) {
    super(message);
    this.name = "ConnectError";
  }
}
```

`code` / `reason` フィールドは constructor 引数で受け取れず、利用箇所で後付け代入が必要。

### `src/base.ts` の後付け代入 3 箇所

下表の行番号は 2026-06-10 時点。実装着手時は `grep -n "new ConnectError\|error.code = event\|error.reason = event" src/base.ts` で再確認すること。

| 箇所                                                  | パターン                 | 行番号                             |
| ----------------------------------------------------- | ------------------------ | ---------------------------------- |
| `getSignalingWebSocket` (string 経路) の `ws.onclose` | 後付け `code` / `reason` | `:1151-1158` (代入は `:1154-1155`) |
| `signaling` の `ws.onclose`                           | 同上                     | `:1276-1283` (代入は `:1279-1280`) |
| `monitorSignalingWebSocketEvent` の `this.ws.onclose` | 同上                     | `:1615-1622` (代入は `:1618-1619`) |

3 箇所すべて、`error = new ConnectError(...)` の直後で `writeWebSocketTimelineLog("onclose", error)` を直接呼ぶ構造で共通する。`signalingTerminate()` は signaling 経路と monitor 経路のみで呼ばれ、string 経路では呼ばれない (string 経路は `getSignalingWebSocket` 内で resolve 前の段階のため `this.ws = ws` 代入前で、`signalingTerminate()` を呼ぶ意味がない)。

`src/base.ts` 内の `new ConnectError(...)` 呼び出しは合計 7 箇所 (`:1138, :1151, :1248, :1251, :1276, :1615, :1625`)。上記 3 箇所以外の 4 箇所 (`:1138, :1248, :1251, :1625`) は `new ConnectError(message)` 形式で `code` / `reason` を渡さず、本 issue では変更しない。いずれも第 1 引数の `message` を必ず渡しているため、本 issue の `message` 必須化により破壊されない。

## 設計方針

### `ConnectError` の constructor 拡張 (`src/utils.ts`)

```ts
export class ConnectError extends Error {
  code?: number;
  reason?: string;

  constructor(message: string, code?: number, reason?: string) {
    super(message);
    this.name = "ConnectError";
    this.code = code;
    this.reason = reason;
  }
}
```

現状からの差分は 3 点: (1) `message?: string` を `message: string` に必須化、(2) `code?: number` / `reason?: string` の 2 引数を追加、(3) `this.code = code;` / `this.reason = reason;` の初期化を追加。`this.name = "ConnectError"` の設定は既存維持 (再追加しない)。

`Object.setPrototypeOf(this, ConnectError.prototype)` は追加しない。`tsconfig.json:3` の `"target": "ES2022"` のもとネイティブ class 継承により `instanceof ConnectError` が正しく動作し、`src/errors.ts` の既存エラークラスも `setPrototypeOf` を使っていないため方針を統一する。

### `src/base.ts` 後付け代入 3 箇所の置換

`:1151-1158`、`:1276-1283`、`:1615-1622` の 3 箇所すべて、以下の同型に書き換える (前後の `this.writeWebSocketTimelineLog` / `this.signalingTerminate` / `reject(error)` 等は現状維持。string 経路は `this.ws` 代入前のため `signalingTerminate()` を新規追加しない):

```ts
const error = new ConnectError(
  `Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`,
  event.code,
  event.reason,
);
```

`error.code = event.code;` / `error.reason = event.reason;` の 2 行を削除する。

### `code` / `reason` の用途と export 方針

`code: number` は CloseEvent 由来 (`event.code`、IANA WebSocket Close Code) のみで使う。後続 issue 0007 / 0008 / 0012 は `code` を渡さず `undefined` のままにする (これらの issue は SDK 内部エラー分類のため `reason` だけを指定する設計)。

`reason: string` には 2 種類の文字列が入り得る:

- (a) CloseEvent 由来の生文字列 (`event.reason`)。本 issue の対象 3 箇所はこちらに該当
- (b) SDK 内部のエラー分類コード (大文字スネーク、例 `WS_SEND_FAILED`)。後続 issue 0007 / 0008 / 0012 で導入予定

`reason: string` の単一フィールドで両用途を許容し、型分離は本 issue では行わない。本 issue では `ConnectError` を `src/sora.ts` から export しない (既存方針を維持)。利用者は `error.name === "ConnectError"` で `ConnectError` を識別し、`error.message` でエラー要因を把握する想定。

`code?: number, reason?: string` の両方をオプショナルとするため、後続 issue が `new ConnectError("msg", undefined, "REASON")` と書くべき箇所で `new ConnectError("msg")` と書いても TypeScript 型エラーは出ない。下流 issue 側の PR レビューで `reason` 引数の指定漏れを目視確認する運用を前提とする。

0008 (`:139` 補足) は本 issue の方針 (`ConnectError` を export しない・`error.name` で識別) と整合している。0012 (`:32, :79`) は「`error instanceof ConnectError && error.reason === "..."` で判別できる」と書いており本 issue の方針と矛盾するため、0012 polish 側で `error.name === "ConnectError"` ベースの判別に書き換える必要がある (本 issue のスコープ外)。

## 完了条件

### コード変更

- [ ] `src/utils.ts:414-422` の `ConnectError` constructor を `(message: string, code?: number, reason?: string)` に拡張し、constructor 内で `this.code = code;` / `this.reason = reason;` を初期化する (`this.name = "ConnectError"` は既存維持)
- [ ] `src/base.ts` の後付け代入 3 箇所 (`:1151-1158`, `:1276-1283`, `:1615-1622`) で `new ConnectError(...)` に `code` / `reason` を引数で渡し、`error.code = ...` / `error.reason = ...` の 2 行を削除する
- [ ] `src/base.ts` の `new ConnectError(message)` のみの 4 箇所 (`:1138, :1248, :1251, :1625`) は変更しない (いずれも第 1 引数で message を渡している)

### テスト追加

- [ ] `tests/utils.test.ts` 末尾に `ConnectError` のテストを追記する。既存スタイルに倣う:
  - vitest の `globals: true` (設定箇所 `vitest.config.ts:8`) 前提で `test` / `expect` は import しない
  - `describe` ブロック無しの flat な `test(...)` 呼び出し
  - テスト名は日本語 (新規追加分のみ。既存テストの英語名はそのまま維持)

- [ ] 既存 `tests/utils.test.ts:4` の `import { createSignalingMessage } from "../src/utils";` を `import { ConnectError, createSignalingMessage } from "../src/utils";` に書き換える (vite-plus の `import/no-duplicates` ルール対策。同一モジュールから別行で import すると lint エラー)

サンプル実装 (このまま追記可、テスト名・コメント文言は変更可):

```ts
// message のみ渡した場合: code / reason は undefined、name は "ConnectError"
test("ConnectError は message のみで生成すると code / reason が undefined になる", () => {
  const e = new ConnectError("msg");
  expect(e.message).toBe("msg");
  expect(e.name).toBe("ConnectError");
  expect(e.code).toBeUndefined();
  expect(e.reason).toBeUndefined();
  expect(e instanceof ConnectError).toBe(true);
  expect(e instanceof Error).toBe(true);
});

// 3 引数すべて渡した場合: code / reason が constructor 引数で初期化される
test("ConnectError は message / code / reason を constructor 引数で受け取る", () => {
  const e = new ConnectError("close", 1006, "abnormal");
  expect(e.message).toBe("close");
  expect(e.name).toBe("ConnectError");
  expect(e.code).toBe(1006);
  expect(e.reason).toBe("abnormal");
});

// code だけ指定して reason を省略した場合: reason は undefined のまま
test("ConnectError は code のみ指定すると reason が undefined のまま生成できる", () => {
  const e = new ConnectError("close", 1006);
  expect(e.code).toBe(1006);
  expect(e.reason).toBeUndefined();
});

// code を undefined、reason のみ指定: 後続 issue 0007 / 0008 / 0012 が使うパターン
test("ConnectError は code を undefined で reason のみ指定して生成できる", () => {
  const e = new ConnectError("ws send failed", undefined, "WS_SEND_FAILED");
  expect(e.code).toBeUndefined();
  expect(e.reason).toBe("WS_SEND_FAILED");
});
```

### 検証

- [ ] ローカルで `pnpm test` が通ること (本 issue で追加したテストを含む。vitest が `tests/` 配下を実行)
- [ ] ローカルで `pnpm typecheck` が通ること。`tsconfig.json:30` の `"exclude": ["node_modules", "tests"]` により `tsc --noEmit` は `tests/` を型チェックしないため、本検証の対象は `src/` 配下 (主に `src/utils.ts` と `src/base.ts` の constructor シグネチャ整合) のみ。`tests/utils.test.ts` の型整合は `pnpm test` 経由で担保する
- [ ] ローカルで `pnpm lint` が通ること

### 変更履歴

- [ ] `CHANGES.md` `## develop` の `### misc` セクション内、既存 `[UPDATE]` 群末尾に以下のエントリを追記する。挿入位置は CHANGES.md `:52` の `- @voluntas` (`[UPDATE] oxc の lint / fmt 設定を vite.config.ts に統合する` の担当者行) の直後、`:53` の `- [FIX] Node 24 で playwright install ...` の直前。担当者行は変更内容より半角 2 文字分インデントを下げる

```
- [UPDATE] 内部 ConnectError の constructor で code と reason を引数として受け取れるようにし base.ts の後付け代入を廃止する
  - @voluntas
```

種別 `[UPDATE]` の根拠: `ConnectError` は `src/sora.ts` から export されておらず、`package.json` の `exports."."` 経由 (公式 API、`dist/sora.d.ts`) では `ConnectError` の型・値ともに再 export されていない (2026-06-10 ビルドで実機確認済み)。SDK 利用者は本変更後も `error.name` / `error.code` / `error.reason` の値および `connect()` の reject 契約に変化を観測しない。挿入先 `### misc` 内の根拠: 機能に直接影響しない内部リファクタ (`shiguredo-changelog` 規約「機能に直接影響しない変更 (...リファクタリング等) は `### misc` サブセクションに記載する」に従う)。

## スコープ外

- `ConnectError` を `src/sora.ts` から export するリファクタ (利用者の `instanceof ConnectError` 判別を可能にする変更。必要なら別 issue で扱う)
- `ConnectError` を `src/errors.ts` へ集約するリファクタ (本 issue では配置を変更しない)
- 後続 issue 0007 / 0008 / 0012 の `new ConnectError(..., undefined, "REASON")` への書き換え — 各 issue で 0021 マージ後に対応

## マージ順

開発の正本チェーンは `issues/closed/0004-bug-fix-abend-compress-failure-skips-cleanup.md` を参照。2026-06-10 時点の本 issue を起点とする後続チェーンは:

```
0021 → 0009 → 0001 → 0008 → 0007 → 0034
```

0001 は既に close 済み (正本チェーン上の位置を保持する目的で記載)。加えて `0021 → 0012` (`removeXxxTrack` の `ConnectError` reject) も 0021 を前提とする。`ConnectError` の新 constructor を直接利用するのは 0007 / 0008 / 0012 の 3 件。0009 / 0034 は `ConnectError` を新規には投げないが、正本チェーン上の順序を維持するため記載する。

## 解決方法

### `src/utils.ts`

`ConnectError` の constructor を `(message?: string)` から `(message: string, code?: number, reason?: string)` に拡張した。constructor 内で `this.code = code` / `this.reason = reason` の初期化を追加し、`this.name = "ConnectError"` の設定は既存維持とした。`Object.setPrototypeOf` は追加していない (`tsconfig.json` の `target: "ES2022"` 下でネイティブ class 継承により `instanceof` が正しく動作するため、`src/errors.ts` の既存クラスとも方針を統一)。

加えて、`code` / `reason` の用途が誤読されないよう、`ConnectError` クラスに JSDoc を追加した。`code` は WebSocket Close Code (IANA) 専用、`reason` は CloseEvent の reason 文字列または SDK 内部のエラー分類コード (大文字スネークケース、例: `WS_SEND_FAILED`) のいずれかが入る、と明文化している。

### `src/base.ts`

後付け代入 3 箇所 (`getSignalingWebSocket` の string 経路 onclose、`signaling` の onclose、`monitorSignalingWebSocketEvent` の onclose) で `error.code = event.code;` / `error.reason = event.reason;` の 2 行を削除し、`new ConnectError(...)` の constructor 引数 (`event.code`, `event.reason`) として渡す形に書き換えた。`writeWebSocketTimelineLog` / `signalingTerminate` / `reject` の呼び出しは現状維持。

`new ConnectError(message)` のみの 4 箇所 (`:1138, :1248, :1251, :1625`) は変更しない。いずれも第 1 引数で `message` を必ず渡しているため、`message` 必須化により破壊されない。

### `tests/utils.test.ts`

末尾に `ConnectError` のテストを 4 件追加した。

- `new ConnectError(message)` で code / reason が undefined のまま生成され、name が `"ConnectError"` で `ConnectError` 型として識別できることを確認する
- `new ConnectError(message, code, reason)` で 3 引数すべてが initializer 引数で初期化されることを確認する
- `new ConnectError(message, code)` で reason が undefined のまま生成されることを確認する
- `new ConnectError(message, undefined, reason)` で reason のみが設定されることを確認する (後続 issue が利用するパターン)

既存の `import { createSignalingMessage } from "../src/utils";` を `import { ConnectError, createSignalingMessage } from "../src/utils";` に書き換えた (vite-plus の `import/no-duplicates` ルール対策)。

### `CHANGES.md`

`## develop` の `### misc` セクション内、既存 `[UPDATE]` 群末尾に以下のエントリを追記した。

```
- [UPDATE] 内部 ConnectError の constructor で code と reason を引数として受け取れるようにし base.ts の後付け代入を廃止する
  - @voluntas
```

### 検証

- ローカルで `pnpm test` が通る (本 issue で追加した 4 件のテストを含む計 76 件)
- ローカルで `pnpm typecheck` が通る
- ローカルで `pnpm lint` が通る
