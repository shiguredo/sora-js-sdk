# `vp pack` の `publint` / `attw` 検証を有効化して npm パッケージ品質を CI で検証する

- Priority: Low
- Created: 2026-06-14
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/add-publint-attw-validation
- Polished: 2026-09-15

## 目的

`vp pack` (vite-plus 内蔵のライブラリ向けビルドコマンド。develop 時点では vite-plus 0.2.8。内部では tsdown 0.22.14 を利用) の `--publint` / `--attw` オプションを有効化し、npm 公開パッケージの型定義・エントリポイント・`exports` 構成の問題を CI で継続的に検証する。`publint` と `attw` (Are the types wrong) はパッケージング上の典型的な問題 (`exports` の条件順、型定義のエントリ、CJS/ESM の整合性等) を検出する OSS。

磨き上げ時に vite-plus 0.2.8 (vite-plus-core に同梱される tsdown 0.22.14) の CLI 定義と型定義を実物で確認し、以下のオプションが内蔵されていることを確認した:

```
--publint       Enable publint (default: false)
--attw          Enable Are the types wrong integration (default: false)
--fail-on-warn  Fail on warnings (default: true)
```

`vite.config.ts` の `pack` ブロックでは対応する `publint` / `attw` / `failOnWarn` / `suppressWarnings` オプションが利用できる。実装着手時に再度 `pnpm exec vp pack --help` で同オプションの存在とデフォルト値を確認すること (vite-plus のバージョンアップで挙動が変わる可能性があるため)。

## 優先度根拠

Low。SDK の機能には直接影響しない CI 検証強化。issue 0054 (`exports["."].require` 削除) のマージにより `exports` 関連の主要警告は解消済みのため、有効化時に残る警告は限定的な見込み。2026.1.0 リリース (issue 0059) では 2026-06-16 に次バージョン送りと判断されており (理由: 検証範囲と運用方針の確定が先)、次回リリースに向けて CI 検証として組み込む。

## 前提条件

本 issue は 0051 (`vp build` → `vp pack` 移行) と 0054 (`exports["."].require` 削除) のマージ完了を前提としていたが、いずれも完了済み:

- issue 0051 (closed、Completed 2026-06-17): `package.json` の `scripts.build` が `vp pack` になり、`vite.config.ts` に `pack` ブロックが存在する
- issue 0054 (closed、Completed 2026-06-16): `exports["."]` から `require` 条件が削除され、`types` / `import` の 2 条件のみになっている

前提は満たされているため、本 issue は現在の develop 上で直接着手できる。

## 現状

- `package.json`: `"type": "module"` の ESM 専用パッケージ。`main` / `module` は `dist/sora.js`、`exports["."]` は `types` (`./dist/sora.d.ts`) → `import` (`./dist/sora.js`) の 2 条件のみ。`scripts.build` は `vp pack`。`devDependencies` に vite-plus 0.2.8 を持つ
- `vite.config.ts`: `pack` ブロック (entry / format / platform / target / outDir / minify / dts / clean / banner / define) は定義済みだが、`publint` / `attw` は未設定
- vite-plus 0.2.8 は `publint` / `@arethetypeswrong/core` を `@voidzero-dev/vite-plus-core` の optional peerDependencies として要求する。現 `pnpm-lock.yaml` にはインストールされていない (任意依存のため) ので、有効化には devDependencies への追加が必要 (詳細は「設計方針」参照)
- 0054 で `exports["."].require` は削除済みのため、`attw` の `false-cjs` 系および `publint` の ESM-as-CJS 系警告の主因は解消済み

## 設計方針

- `vite.config.ts` の `pack` ブロックに `publint: true` / `attw: true` の 2 行を追加する
- `package.json` の `devDependencies` に `publint` と `@arethetypeswrong/core` を追加し、`pnpm-lock.yaml` を更新する
  - vite-plus-core の optional peerDependencies のため自動インストールされず、追加せずに有効化すると tsdown が `Failed to import module "publint". Please ensure it is installed.` でビルドを失敗させる
  - attw は tsdown が `@arethetypeswrong/core` を直接 import する (`@arethetypeswrong/cli` ではない)
- `--fail-on-warn` はデフォルト true のため、検出された警告でビルドが失敗する
- 0054 マージで `exports["."].require` 関連の警告 (`attw` の `false-cjs`、`publint` の ESM-as-CJS 警告) は解消される見込みだが、`publint` は他にも `main` / `module` / `engines` / `files` 等の構成について警告を出しうる。残る警告は実装着手時に評価し、判断基準 (下記) に従って対応する

### 許容警告の判断基準

実装着手時に検出された警告について、以下の基準で 2 つに分類する:

- **本 issue 内で対応する (許容)**: ライブラリの公開 API / `package.json` の構造変更を必要としない警告。以下の手段で該当警告のみ除外し、除外理由を日本語コメントで明記する
  - `pack.suppressWarnings`: tsdown が `failOnWarn` の適用前に警告メッセージを除外するオプション (文字列 / RegExp / 述語関数を指定)。`publint` 由来の警告を含む全警告に有効
  - `pack.attw.ignoreRules`: attw のルール名 (`no-resolution` / `false-cjs` 等) 単位の除外。`pack.attw.profile` / `level` も併用可
  - `publint` 0.3.8 の Options にはルール単位の ignore が存在しない (pkgDir / level / pack / strict のみ) ため、publint のルール除外は `suppressWarnings` で行う
- **別 follow-up issue で対応**: ライブラリの公開 API / `package.json` 構造の変更を必要とする警告 (例: `main` フィールドの再考、`exports` の他条件追加など)。本 issue では一旦その警告だけを除外して merge し、follow-up issue を起票する

## 変更対象ファイル

| ファイル         | 内容                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `vite.config.ts` | `pack` ブロックに `publint: true` / `attw: true` を追加                                        |
| `package.json`   | `devDependencies` に `publint` / `@arethetypeswrong/core` を追加                                |
| `pnpm-lock.yaml` | 前提となる依存追加に伴う更新                                                                    |
| `CHANGES.md`     | `## develop` の `### misc` の `[ADD]` 群末尾に 1 エントリ追記 (挿入位置の詳細は完了条件を参照) |

## 完了条件

- `vite.config.ts` の `pack` ブロックに `publint: true` および `attw: true` が追加されている
- `package.json` の `devDependencies` に `publint` / `@arethetypeswrong/core` が追加され、`pnpm-lock.yaml` が更新されている
- `pnpm run build` (内部で `vp pack` 実行) で `publint` / `attw` の検証が実行される。CI の `ci.yaml` / `npm-publish.yml` も `vp run build` 経由で同様に実行される
- ビルドが警告 / エラーなしで完了する。残る警告がある場合は `pack.suppressWarnings` / `pack.attw.ignoreRules` で許容ルールを設定し、`vite.config.ts` のコメントで理由を日本語で記載する
- ローカルで `pnpm run build` / `pnpm run test` / `pnpm e2e-test` (chromium) が pass する
- `CHANGES.md` `## develop` の `### misc` 内の `[ADD]` 群末尾に次を追記する (現 develop では `[ADD] typedoc 生成物を GitHub Pages にデプロイする workflow を追加する` エントリの直後、`[UPDATE] @playwright/test` エントリの直前。前後のエントリ追加・削除で位置は変動するため、マージ時点では「`### misc` の `[ADD]` 群末尾」という相対位置で判断する):

  ```
  - [ADD] `vp pack` の `publint` / `attw` 検証を有効化する
    - @voluntas
  ```

- 動作確認:
  - 着手時に `pnpm exec vp pack --help` で `--publint` / `--attw` / `--fail-on-warn` フラグの存在とデフォルト値を再確認する
  - `pnpm why publint` / `pnpm why @arethetypeswrong/core` を実行し、devDependencies として直接現れることを確認して解決方法セクションに記録する (追加前は vite-plus-core の optional peer として未インストールであることも併せて記録する)

## 注意点

- `vp pack --fail-on-warn` はデフォルト true。本 issue で `publint: true` / `attw: true` を入れると、警告検出時に CI ビルドが失敗する
- `publint` / `@arethetypeswrong/core` は vite-plus-core の optional peerDependencies のため、devDependencies に追加しない限り `vp pack` はモジュール import に失敗する
- attw はパッケージの型を解決する際に外部へ問い合わせることがある。CI 環境 (GitHub Actions) はインターネットアクセス可能なので問題ない想定
- `e2e-test` 系スクリプトも先頭で `vp pack` を実行するため、`pnpm e2e-test` 実行時にも publint / attw の検証が走る

## スコープ外

- `package.json` の `exports` 構成変更 — issue 0054 で対応済み (closed)
- `vp build` から `vp pack` への移行 — issue 0051 で対応済み (closed)
- 他のパッケージ品質ツール (例: `bundlewatch`、`size-limit` 等) の導入 — 別 issue

## マージ順

- 上流依存だった 0051 / 0054 はともに closed 済みで、依存は解消している
- 2026.1.0 リリース (issue 0059、closed) では次バージョン送りと判断されたため、次回リリースのタイミングで取り込む

## 関連

- issues/closed/0051-refactor-use-vp-pack-for-library-build.md (`vp pack` 移行、closed)
- issues/closed/0054-change-exports-require-condition.md (`exports` から `require` 条件削除、closed)
- issues/closed/0059-release-2026-1-0.md (2026-06-17 リリース。本 issue は次バージョン送りと明記)

## 解決方法

実装手順 (実装完了後に「実績」セクションを追記):

1. `package.json` の `devDependencies` に `publint` / `@arethetypeswrong/core` を追加し、`vp install` で `pnpm-lock.yaml` を更新する
2. `pnpm exec vp pack --help` で `--publint` / `--attw` / `--fail-on-warn` フラグの存在とデフォルト値を確認する
3. `pnpm why publint` / `pnpm why @arethetypeswrong/core` で devDependencies としての解決を確認し、結果を本セクション末尾に記録する
4. `vite.config.ts` の `pack: { ... }` ブロックの末尾に `publint: true,` と `attw: true,` の 2 行を追加する
5. `pnpm run build` を実行し、検出された警告/エラーを「許容警告の判断基準」に従って分類する
6. 許容する警告は `pack.suppressWarnings` (または `pack.attw.ignoreRules`) で除外し、除外理由を日本語コメントで `vite.config.ts` に記載する
7. 別 issue 化が必要な警告は follow-up issue を起票する
8. `pnpm run test` / `pnpm e2e-test` (chromium) で回帰がないことを確認する
9. `CHANGES.md` の `### misc` の `[ADD]` 群末尾に上記エントリを追記する
10. CI で Build / Test ジョブが正常に完了することを確認する

実績 (実装完了後に追記):
