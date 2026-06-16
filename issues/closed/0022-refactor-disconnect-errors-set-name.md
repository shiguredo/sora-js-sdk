# `errors.ts` の Disconnect 系エラークラスの `name` 設定に回帰テストと変更履歴を整備する

- Priority: Low
- Created: 2026-05-21
- Polished: 2026-06-16
- Completed: 2026-06-16
- Model: Opus 4.7
- Branch: feature/refactor-disconnect-errors-name

## 目的

`src/errors.ts` の `DisconnectWaitTimeoutError` / `DisconnectInternalError` / `DisconnectDataChannelError` の各 constructor で `this.name` をクラス名に設定する変更が、PR #719 (`commit e5eaba02`, 2026-06-09) の `oxc` 統合作業の副次変更として先行マージされた。`CHANGES.md` への記載は無く、回帰テストも存在しない。本 issue では (1) 既存実装に対する回帰テストを `tests/errors.test.ts` (新規) に追加し、(2) `CHANGES.md` `## develop` `### misc` の `[UPDATE]` 群末尾に後追いエントリを追加して履歴を補完する。両者は `e5eaba02` 由来 `name` 設定の裏付けという 1 目的の不可分な作業であり、片方欠落は意味をなさないため同一ブランチ・同一コミットで完結させる。

## 必要性

**必要だが優先度は低い** (確信度: 高)。`src/errors.ts:2-23` の 3 クラスは `this.name` を設定済みだが、`CHANGES.md` 記録と回帰テストが未整備。3 クラスのインスタンスは現状利用者にもモニタリングにも届かず、観測上の改善は得られない:

- `DisconnectInternalError` (`src/base.ts:985`): `new DisconnectInternalError().message` で `.message` 文字列だけ取り出して `reason` に格納し、インスタンスは破棄する。
- `DisconnectWaitTimeoutError` (`src/base.ts:991`) / `DisconnectDataChannelError` (`src/base.ts:1010`): `reject(new ...)` するが、reject 先は `disconnectDataChannel()` 内の `Promise.race` (`src/base.ts:1069`) の catch で `(error as Error).message` だけ取り出して `reason` に詰める (`src/base.ts:1074`)。Error インスタンス自体は外に出ない。

さらに 3 クラスは `src/sora.ts:280-349` の `export type { ... }` ブロックに含まれず、利用者は `instanceof` も使えない。したがって `name` 設定で現状の利用者観測値 (最終的に届く `SoraCloseEvent.reason` の文字列) は変わらない。本 issue の価値は (1) `e5eaba02` の副次変更が意図せず revert された場合の回帰検知、(2) `CHANGES.md` への後追い記録による履歴の正確性、の 2 点に限られる。

## 優先度根拠

Low。`this.name` 設定そのものは内部実装のみで `SoraCloseEvent.reason` への観測影響は無く、`CHANGES.md` も後方互換のある `[UPDATE]` として追記するに留まる。`e5eaba02` の副次変更が `CHANGES.md` 未記録のままリリースされると、利用者向け変更履歴の網羅性が崩れるため、リリース前 (2026.1.0) の整備対象として残す。

## 現状

- `src/errors.ts:2-23` の 3 クラスとも、constructor で `super("...")` の直後に `this.name = "<クラス名>"` を設定済み (`e5eaba02` 経由)。`Object.setPrototypeOf` は付けない方針が採られている。
- `tests/errors.test.ts` は存在せず、3 クラスの `name` / `message` / `instanceof` を担保する回帰テストが無い。
- `CHANGES.md` `## develop` には `errors.ts` 関連エントリが無く、`e5eaba02` 由来の `name` 設定が変更履歴に記録されていない。0021 (closed) で同一 commit から導入された `ConnectError` の constructor 拡張は `CHANGES.md:85-86` に `[UPDATE]` として既に記録済みだが、`ConnectError` の `this.name = "ConnectError"` 設定および Disconnect 系 3 クラスの `this.name` 設定はいずれも変更履歴に未記載。

## 設計方針

### テスト (`tests/errors.test.ts` 新規)

3 クラスとも `name` / `message` / `instanceof` (各クラスおよび `Error`) を検証する。テストの目的は以下:

- `e5eaba02` で導入された `this.name` 設定が将来 revert されないことの回帰検知
- `instanceof` テストにより、`Object.setPrototypeOf` を省いた `e5eaba02` の方針 (`tsconfig.json:5` `"target": "ES2022"` および `tsconfig.json:70` `"useDefineForClassFields": true` 環境でネイティブ class 継承により `instanceof` が正しく動く前提) が将来も成立し続けることを副次的に担保する
- `message` 文字列の不変。`src/base.ts:985` および `src/base.ts:1074` 経由で `reason` に詰められる値が壊れないことを担保する

テストは `vitest.config.ts:8` の `globals: true` 設定により `test` / `expect` は import 不要。`tests/sora.test.ts` / `tests/utils.test.ts` の既存スタイルに揃え、flat な `test(...)` 呼び出しで日本語テスト名を使う。`src/errors.ts` 単位で `tests/` を分割する既存方針 (`tests/utils.test.ts` ↔ `src/utils.ts`、`tests/sora.test.ts` ↔ `src/sora.ts`) に倣い `tests/errors.test.ts` を新規作成する。import 順とテスト並び順は揃え、`src/errors.ts` の宣言順 (`DisconnectWaitTimeoutError` → `DisconnectInternalError` → `DisconnectDataChannelError`) に統一する。

```ts
import {
  DisconnectWaitTimeoutError,
  DisconnectInternalError,
  DisconnectDataChannelError,
} from "../src/errors";

test("DisconnectWaitTimeoutError は name にクラス名を設定し message を維持する", () => {
  const e = new DisconnectWaitTimeoutError();
  expect(e.name).toBe("DisconnectWaitTimeoutError");
  expect(e.message).toBe("DISCONNECT-WAIT-TIMEOUT-ERROR");
  expect(e instanceof DisconnectWaitTimeoutError).toBe(true);
  expect(e instanceof Error).toBe(true);
});

test("DisconnectInternalError は name にクラス名を設定し message を維持する", () => {
  const e = new DisconnectInternalError();
  expect(e.name).toBe("DisconnectInternalError");
  expect(e.message).toBe("DISCONNECT-INTERNAL-ERROR");
  expect(e instanceof DisconnectInternalError).toBe(true);
  expect(e instanceof Error).toBe(true);
});

test("DisconnectDataChannelError は name にクラス名を設定し message を維持する", () => {
  const e = new DisconnectDataChannelError();
  expect(e.name).toBe("DisconnectDataChannelError");
  expect(e.message).toBe("DISCONNECT-DATA-CHANNEL-ERROR");
  expect(e instanceof DisconnectDataChannelError).toBe(true);
  expect(e instanceof Error).toBe(true);
});
```

### CHANGES.md

`## develop` の `### misc` サブセクション内、`CHANGES.md:88` の `- @voluntas` (`[UPDATE] Algorithm 型のグローバル拡張を削除し generateCertificate の引数型を EcKeyGenParams に置き換える` の担当者行) の直後、`CHANGES.md:89` の `- [FIX] Node 24 で playwright install ...` の直前に以下の 1 エントリを追加する。`### misc` 内 `[UPDATE]` 群の末尾になる。`shiguredo-changelog` 規約「機能に直接影響しない変更 (内部リファクタ・テスト整備等) は `### misc` サブセクションに記載」「`CHANGE → ADD → UPDATE → FIX` の順」に従う。

```
- [UPDATE] `DisconnectWaitTimeoutError` / `DisconnectInternalError` / `DisconnectDataChannelError` の constructor で `name` プロパティをクラス名に設定するようにする
  - @voluntas
```

担当者表記は `CHANGES.md` `## develop` の既存表記に揃え `@voluntas` を使う。

## スコープ外

- `ConnectError` (`src/utils.ts`) の構造変更 — issue 0021 (closed, 2026-06-10) で完了済み。同一 commit `e5eaba02` で `this.name = "ConnectError"` も導入されているが、その後追い記録は本 issue ではなく 0021 の post-merge 整備として別途扱う (本 issue では Disconnect 系 3 クラスのみ対象)
- `ConnectError` を `errors.ts` へ集約するリファクタ — 別 issue 未起票。本 issue では扱わない
- `message` 文字列 (`"DISCONNECT-WAIT-TIMEOUT-ERROR"` 等) の変更 — `src/base.ts:985, 1074` 経由で `reason` に詰める値の不変性を維持する
- Disconnect 系 3 クラスを `src/sora.ts` の `export type` に含めて利用者から `instanceof` 可能にするか否かの設計判断 — 別 issue 未起票。本 issue では扱わない

## 完了条件

- `tests/errors.test.ts` (新規) で 3 クラスの `name` / `message` / `instanceof` (クラスおよび `Error`) を assert する
- `src/errors.ts` の 3 クラスへの差分が `develop` に対してゼロであること (`git diff develop -- src/errors.ts` が空)。`e5eaba02` で先行マージ済みのため本 issue では `src/errors.ts` を変更しない
- `CHANGES.md` `## develop` `### misc` 内の `[UPDATE]` 群末尾 (`:88` の `- @voluntas` の直後、`:89` の `- [FIX] Node 24 ...` の直前) に `[UPDATE]` エントリを 1 行追加する (利用者観測値は不変のため後方互換あり)
- テスト追加と `CHANGES.md` エントリ追加は同一コミットに含めること (片方欠落は意味をなさないため)
- ローカルで `pnpm test` / `pnpm typecheck` / `pnpm lint` がすべて通ること

## 解決方法

- `tests/errors.test.ts` を新規作成し、`DisconnectWaitTimeoutError` / `DisconnectInternalError` / `DisconnectDataChannelError` の 3 クラスについて `name` / `message` / `instanceof` (派生クラスと `Error`) を assert する flat な vitest テストを 3 件追加した。
  - ファイル冒頭コメントで本テストの目的 (3 クラスの `name` 設定が将来削除されないことの回帰検知、`message` が `src/base.ts` 経由で `SoraCloseEvent.reason` に詰める文字列の元であること、`Object.setPrototypeOf` を使わずにネイティブ class 継承だけで `instanceof` が成立し続けることの副次担保) を明示した。
  - テスト名は `new <Class>() は name にクラス名を設定し message を維持する` 形式に揃え、既存 `tests/utils.test.ts` の `new ConnectError(...)` テストの命名スタイルと一致させた。
  - import 順とテスト並び順は `src/errors.ts` の宣言順 (`DisconnectWaitTimeoutError` → `DisconnectInternalError` → `DisconnectDataChannelError`) に統一した。
- `CHANGES.md` の `## develop` `### misc` 内、`[UPDATE] Algorithm 型のグローバル拡張を削除し ...` の直後、`[FIX] Node 24 で playwright install ...` の直前に `[UPDATE]` エントリを 1 件追加した。
- `src/errors.ts` には差分なし (`e5eaba02` で先行マージ済み)。
- `pnpm test` (108 件すべて pass) / `pnpm typecheck` / `pnpm lint` をローカルで通過させた。
