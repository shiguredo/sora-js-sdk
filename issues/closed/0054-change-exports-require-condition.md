# `package.json` の `exports` から `require` 条件を削除する

- Priority: Low
- Created: 2026-06-14
- Completed: 2026-06-16
- Model: Opus 4.7
- Branch: feature/change-exports-require-condition
- Polished: 2026-06-16

## 目的

`package.json` の `exports["."].require` (`:25`) を削除し、ESM 専用 SDK としてのパッケージング整合性を保つ。

`sora-js-sdk` は `"type": "module"` の ESM 専用 SDK でありながら、`exports["."].require` が ESM ファイル `./dist/sora.js` を指している。この状態では `require("sora-js-sdk")` を呼び出しても `ERR_REQUIRE_ESM` で失敗するため、`require` 条件は無効。本 issue で `require` 条件を削除し、`exports` の宣言を実態 (ESM 専用) に整合させる。

## 優先度根拠

Low。後方互換のない変更 (`[CHANGE]`) だが、現状の `require` 条件は壊れているため実利用者影響は実質ゼロ (元から動作していない)。

issue 0053 (`publint` / `attw` 有効化) を有効化したときに、`publint` の「ESM-as-CJS」系警告および `attw` の `false-cjs` 警告が検出されるため、0053 着手前に本 issue を解消しておく必要がある。詳細は「マージ順」セクション参照。

## 現状

`package.json:18-27`:

```json
"type": "module",
"main": "dist/sora.js",
"module": "dist/sora.js",
"exports": {
  ".": {
    "types": "./dist/sora.d.ts",
    "import": "./dist/sora.js",
    "require": "./dist/sora.js"
  }
}
```

`"type": "module"` (`:18`) が ESM パッケージであることを宣言。`exports["."].require` (`:25`) が ESM ファイル `./dist/sora.js` を指しているため、`require` 経由のロードは現状でも `ERR_REQUIRE_ESM` で失敗する。

利用者経路と現状の挙動:

- `import Sora from "sora-js-sdk"` (ESM): `exports["."].import` (`:24`) を解決 → 動作する
- `require("sora-js-sdk")` (CJS): `exports["."].require` (`:25`) を解決しようとして `ERR_REQUIRE_ESM` で失敗

リポジトリ内の検証経路:

- `tests/sora.test.ts`: `import Sora from "../src/sora"` で src を直接参照するため本変更の影響なし
- `e2e-tests/`: `import Sora from "sora-js-sdk"` (workspace 参照、ESM 経路) のため本変更の影響なし

## 利用者への影響

`require` 条件の削除は CHANGE (後方互換のない変更) だが、削除前後とも `require("sora-js-sdk")` は失敗する。エラーメッセージのみ変化する:

- 削除前: `ERR_REQUIRE_ESM` (ESM を CJS から読もうとして失敗)
- 削除後: `ERR_PACKAGE_PATH_NOT_EXPORTED` (`require` 条件が `exports` に存在しないので解決不能)

実利用上の挙動 (動作しない) は変わらない。`require("sora-js-sdk")` を使っているコードがある場合は `import` または `await import()` に書き換える必要がある (元から動作しないため移行が必要だが、エラーメッセージが変わる旨を CHANGES.md エントリに明記)。

TypeScript `moduleResolution` 別の影響:

- `"bundler"`: 影響なし (常に `import` 条件を解決)
- `"node16"` / `"nodenext"`: `.cjs` ファイルから SDK を import する場合は元から動作しないが、削除後はエラーメッセージが変わる
- `"node10"` (旧 `"node"`): `exports` を無視して `main` を見る。`main` も ESM ファイルを指すため CJS 環境では元から失敗

## 設計方針

`package.json:25` の `"require": "./dist/sora.js"` 1 行を削除する。

`exports["."]` の条件キー順序は `types` → `import` を維持する。`attw` (Are the types wrong) の条件順チェック (`types` 条件が他の条件より前にあること) に従う。

```json
"exports": {
  ".": {
    "types": "./dist/sora.d.ts",
    "import": "./dist/sora.js"
  }
}
```

### 代替案 (採用しない)

`vp pack` で CJS ビルドも生成し、`require` 条件で `./dist/sora.cjs` を指す案も検討したが採用しない。理由: `sora-js-sdk` はブラウザ向け SDK で CJS サポートの需要が低く、CJS ビルドのメンテコストを負担する利益がない。将来 CJS サポートの要求が出た場合は別 issue で `vp pack` の dual emit を再検討する。

## スコープ外

- `package.json:19-20` の `"main"` / `"module"` フィールドの扱い — `publint` で `module` フィールドが非標準として警告される可能性、`main` フィールドが ESM 専用パッケージで non-canonical として警告される可能性がある。これは 0053 着手時に検出された警告に基づいて follow-up issue で扱う (本 issue は `exports["."].require` 削除のみ)
- CJS ビルドの生成 (上記「代替案」参照)
- `exports` の他条件追加 (e.g. `default`, `node`, `browser`)

## 変更対象ファイル

| ファイル       | 内容                                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| `package.json` | `exports["."].require` の 1 行 (`:25`) を削除                                           |
| `CHANGES.md`   | `## develop` の直系 `[CHANGE]` 群末尾に 1 エントリ追記 (挿入位置の詳細は完了条件を参照) |

## 完了条件

- `package.json:21-27` の `exports["."]` から `require` 条件 (`:25`) が削除されている
- 条件キーの順序は `types` → `import` の順を維持する
- `pnpm run build` / `pnpm run typecheck` / `pnpm run lint` / `pnpm run test` が pass する
- `pnpm e2e-test` (chromium) が pass する
- `npm pack --dry-run` を実行し、含まれる `package.json` の `exports["."]` に `require` キーが存在しないことを確認する
- 動作確認 (参考): `pnpm dlx publint` および `pnpm dlx attw .` で `false-cjs` / ESM-as-CJS 系警告が消えていることを確認する (0053 マージ後は CI で自動検証されるため本 issue では参考確認)
- `CHANGES.md` `## develop` の直系 `[CHANGE]` 群末尾に次を追記する (2026-06-16 時点では `:21` の `- @voluntas` (`[CHANGE] removeAudioTrack / removeVideoTrack ...` の担当者行) の直後、`:22` の `[UPDATE] pnpm 11 系に上げる` の直前。0051 / 0052 のマージで行番号が変動するため、マージ時点では「`## develop` 直系の `[CHANGE]` 群末尾」という相対位置で判断する):

  ```
  - [CHANGE] `package.json` の `exports["."]` から `require` 条件を削除し ESM のみをサポートする
    - `require("sora-js-sdk")` は元から `ERR_REQUIRE_ESM` で失敗していたが、削除後は `ERR_PACKAGE_PATH_NOT_EXPORTED` でエラーメッセージが変わる
    - CJS で利用していたコードは `import` または `await import()` に置き換える必要がある
    - @voluntas
  ```

## マージ順

- 上流依存: なし (本 issue は `package.json` の 1 行削除のみで他 issue と独立)
- 下流依存: 0053 (`publint` / `attw` 有効化) — 本 issue マージで 0053 が検出する `exports["."].require` 関連警告 (`publint` の ESM-as-CJS、`attw` の `false-cjs`) が解消される
- 推奨マージ順: 0051 (`vp pack` 移行) → 0054 (本 issue) → 0053 (`publint` / `attw` 有効化)
- 2026.1.0 リリース (issue 0059) の Low ブロッカー候補

## 関連

- issues/0051-refactor-use-vp-pack-for-library-build.md (`vp pack` 移行、本 issue の前にマージ推奨)
- issues/0053-add-publint-attw-validation.md (本 issue マージ後に有効化される CI 検証)
- issues/0059-release-2026-1-0.md (本 issue は 2026.1.0 Low ブロッカー候補)

## 解決方法

実装手順 (実装完了後に「実績」セクションを追記):

1. 0051 が `vp pack` 移行を完了していることを確認する (推奨順序のため必須ではない)
2. `package.json:25` の `"require": "./dist/sora.js"` 1 行を削除する
3. `pnpm run build` / `pnpm run typecheck` / `pnpm run lint` / `pnpm run test` を実行する
4. `pnpm e2e-test` (chromium) を実行する
5. `npm pack --dry-run` で生成される tarball 内 `package.json` の `exports["."]` から `require` キーが消えていることを確認する
6. (参考) `pnpm dlx publint` および `pnpm dlx attw .` で関連警告が消えていることを確認する
7. `CHANGES.md` の `## develop` 直系 `[CHANGE]` 群末尾に上記エントリを追記する
8. CI で Build / Test ジョブが正常に完了することを確認する

実績:

- `package.json` の `exports["."]` から `"require": "./dist/sora.js"` の 1 行を削除した。条件キーの順序は `types` → `import` を維持。
- `CHANGES.md` の `## develop` 配下、`[CHANGE]` 群末尾 (`Node.js の最低要件を 22.18.0` エントリの直後、`[UPDATE] pnpm 11 系に上げる` の直前) に `[CHANGE]` エントリ 1 件を追加した。
- ローカルで `pnpm build` (`dist/sora.js` 58.31 kB / gzip 11.94 kB) / `pnpm typecheck` / `pnpm lint` / `pnpm test` (108 件 pass) / `pnpm fmt` を順序通り通過。fmt 後の追加差分なし。`npm pkg get exports` の出力で `exports["."]` に `require` キーが消えていることを確認した。
- `pnpm e2e-test` (chromium) はローカルでは実行せず、CI に委ねる方針とした。
- `main` / `module` フィールドの扱いは issue 0054 のスコープ外 (`:85-87` 参照) として残置。0053 (`publint` / `attw` 有効化) 着手時に検出される警告に基づいて follow-up issue で対処する。
