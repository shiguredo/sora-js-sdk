# `vp pack` の `publint` / `attw` 検証を有効化して npm パッケージ品質を CI で検証する

- Priority: Low
- Created: 2026-06-14
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/add-publint-attw-validation
- Polished: 2026-06-16

## 目的

`vp pack` (vite-plus 0.1.24 内蔵) の `--publint` / `--attw` オプションを有効化し、npm 公開パッケージの型定義・エントリポイント・`exports` 構成の問題を CI で継続的に検証する。`publint` と `attw` (Are the types wrong) はパッケージング上の典型的な問題 (`exports` の条件順、型定義のエントリ、CJS/ESM の整合性等) を検出する OSS。

2026-06-16 時点で `pnpm exec vp pack --help` を実行し、以下のオプションが内蔵されていることを確認した:

```
--publint       Enable publint (default: false)
--attw          Enable Are the types wrong integration (default: false)
--fail-on-warn  Fail on warnings (default: true)
```

したがって、`devDependencies` への `publint` / `@arethetypeswrong/cli` 追加は原則不要 (vite-plus が内部依存として保持し、`pack.publint` / `pack.attw` 経由で呼び出す想定)。実装着手時に再度 `pnpm exec vp pack --help` で同オプションの存在とデフォルト値を確認すること (vite-plus のバージョンアップで挙動が変わる可能性があるため)。

## 優先度根拠

Low。SDK の機能には直接影響しない CI 検証強化。issue 0054 (`exports.require` 削除) を先にマージすれば `exports` 関連の警告は最小化される見込み。2026.1.0 リリース (issue 0059) の Low ブロッカー候補として、CI 検証として継続的に効果がある形で組み込みたい。

## 前提条件

本 issue は以下の 2 issue のマージ完了および polish 完了を前提とする (マージ順は「マージ順」セクションを参照):

- issue 0051 (`vp build` → `vp pack` 移行、Polished 2026-06-14): `pack` ブロックを有効化する基盤
- issue 0054 (`exports["."].require` 削除、Low、polish 待ち): `require` 条件が ESM ファイルを指す問題を解消し、`publint` / `attw` の主要警告を最小化

0051 が未マージの状態では `pnpm run build` は `vp build` を実行するため `pack` ブロックは参照されず、本 issue の検証が走らない。0054 が未マージの状態では `publint` / `attw` で `exports["."].require` 関連の警告が必ず検出され、`--fail-on-warn` デフォルト有効下でビルドが失敗する。

0054 は Polished 2026-06-16 (本日) で磨き上げ済み。本 issue の着手は 0054 のマージ完了を待つ必要がある。

## 現状

`package.json:18-29` で SDK は ESM パッケージとして宣言され、build スクリプトは `vp build`:

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
},
"scripts": {
  "build": "vp build",
```

`package.json:49` で vite-plus 0.1.24 を依存に持つ。`vite.config.ts` には `pack` ブロックは未定義 (現在 `vp build` の lib モード設定のみ)。

`exports["."].require` (`package.json:25`) が ESM ファイル `./dist/sora.js` を指している問題は issue 0054 で扱う。本 issue は 0054 マージ後の状態で `publint` / `attw` を有効化する。

## 設計方針

- 0051 が新設した `vite.config.ts` の `pack` ブロックに `publint: true` / `attw: true` の 2 行を追加する
- `devDependencies` への追加は不要 (vp pack 内蔵のため)
- `--fail-on-warn` はデフォルト true のため、検出された警告でビルドが失敗する
- 0054 マージで `exports["."].require` 関連の警告 (`attw` の `false-cjs`、`publint` の ESM-as-CJS 警告) は解消される見込みだが、`publint` は他にも `main` / `module` / `engines` / `files` 等の構成について警告を出しうる。残る警告は実装着手時に評価し、判断基準 (下記) に従って対応する

### 許容警告の判断基準

実装着手時に検出された警告について、以下の基準で 2 つに分類する:

- **本 issue 内で対応する (許容)**: ライブラリの公開 API / `package.json` の構造変更を必要としない警告 (例: 特定の互換性 minor warning)。`vite.config.ts` の `pack.publint` / `pack.attw` のオプションで該当ルールのみ除外し、除外理由を日本語コメントで明記する。除外オプションの具体的キー名は実装着手時に vite-plus 0.1.24 の型定義で確認する
- **別 follow-up issue で対応**: ライブラリの公開 API / `package.json` 構造の変更を必要とする警告 (例: `main` フィールドの再考、`exports` の他条件追加など)。本 issue では一旦その警告だけを除外して merge し、follow-up issue を起票する

## 変更対象ファイル

| ファイル         | 内容                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `vite.config.ts` | `pack` ブロックに `publint: true` / `attw: true` を追加                                        |
| `CHANGES.md`     | `## develop` の `### misc` の `[ADD]` 群末尾に 1 エントリ追記 (挿入位置の詳細は完了条件を参照) |

## 完了条件

- `vite.config.ts` の `pack` ブロックに `publint: true` および `attw: true` が追加されている
- `pnpm run build` (issue 0051 マージ後は内部で `vp pack` 実行) で `publint` / `attw` の検証が実行される
- ビルドが警告 / エラーなしで完了する。残る警告がある場合は `pack.publint.options` 等で許容ルールを設定し、`vite.config.ts` のコメントで理由を日本語で記載する
- ローカルで `pnpm run build` / `pnpm run test` / `pnpm e2e-test` (chromium) が pass する
- `CHANGES.md` `## develop` の `### misc` 内の `[ADD]` 群末尾に次を追記する (2026-06-16 時点では `:78` の `- @voluntas` (`[ADD] npm publish に --provenance を追加して supply chain 透明性を向上させる` の担当者行) の直後、`:79` の `[UPDATE] e2e テストの Node バージョンを 22 / 24 / 26 に更新する` の直前。0051 / 0054 マージで行番号が変動するため、マージ時点では「`### misc` の `[ADD]` 群末尾」という相対位置で判断する):

  ```
  - [ADD] `vp pack` の `publint` / `attw` 検証を有効化する
    - @voluntas
  ```

- 動作確認:
  - 着手時に `pnpm exec vp pack --help` で `--publint` / `--attw` / `--fail-on-warn` フラグの存在とデフォルト値を再確認する
  - `pnpm why publint` および `pnpm why @arethetypeswrong/cli` (または `/core`) を実行し、vite-plus の内部依存として現れる (または現れない) ことを確認して解決方法セクションに記録する

## 注意点

- `vp pack --fail-on-warn` はデフォルト true。本 issue で `publint: true` / `attw: true` を入れると、警告検出時に CI ビルドが失敗する。0054 マージ後で警告が出ない状態を前提とする
- `vite-plus` 0.1.24 が `publint` / `@arethetypeswrong/core` を内部で動的に呼び出す設計のため、`pnpm why publint` で本 SDK のトップレベル依存ツリーに publint は現れない可能性がある (vite-plus の内部依存)。これは想定通り
- `attw` は型レジストリにアクセスして CJS/ESM の整合性を検証するが、CI 環境がオフラインの場合は失敗する可能性がある。CI 環境 (GitHub Actions) はインターネットアクセス可能なので問題ない想定

## スコープ外

- `package.json` の `exports` 構成変更 — issue 0054 で対応
- `vp build` から `vp pack` への移行 — issue 0051 で対応
- 他のパッケージ品質ツール (例: `bundlewatch`、`size-limit` 等) の導入 — 別 issue

## マージ順

- 上流依存:
  - 0051 (`vp pack` 移行、Polished 2026-06-14): `pack` ブロックを有効化する基盤
  - 0054 (`exports.require` 削除): `publint` / `attw` の警告を最小化
- 推奨マージ順: 0051 → 0054 → 0053 (本 issue)
- 2026.1.0 リリース (issue 0059) の Low ブロッカー候補

## 関連

- issues/0051-refactor-use-vp-pack-for-library-build.md (本 issue の前にマージする `vp pack` 移行)
- issues/0054-change-exports-require-condition.md (本 issue の前にマージする `exports.require` 削除)
- issues/0059-release-2026-1-0.md (本 issue は 2026.1.0 Low ブロッカー候補)

## 解決方法

実装手順 (実装完了後に「実績」セクションを追記):

1. 0051 / 0054 のマージ完了を確認する
2. `pnpm exec vp pack --help` で `--publint` / `--attw` / `--fail-on-warn` フラグの存在とデフォルト値を確認する
3. `pnpm why publint` / `pnpm why @arethetypeswrong/cli` (または `/core`) で vite-plus の内部依存状態を確認し、結果を本セクション末尾に記録する
4. 0051 が新設した `vite.config.ts` の `pack: { ... }` ブロックの末尾に `publint: true,` と `attw: true,` の 2 行を追加する
5. `pnpm run build` を実行し、検出された警告/エラーを「許容警告の判断基準」に従って分類する
6. 許容する警告は `pack.publint` / `pack.attw` のオプションでルール除外し、除外理由を日本語コメントで `vite.config.ts` に記載する
7. 別 issue 化が必要な警告は follow-up issue を起票する
8. `pnpm run test` / `pnpm e2e-test` (chromium) で回帰がないことを確認する
9. `CHANGES.md` の `### misc` の `[ADD]` 群末尾に上記エントリを追記する
10. CI で Build / Test ジョブが正常に完了することを確認する

実績 (実装完了後に追記):
