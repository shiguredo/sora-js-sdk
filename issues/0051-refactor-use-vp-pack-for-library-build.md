# ライブラリビルドを `vp build` から `vp pack` に移行する

- Priority: Low
- Created: 2026-06-14
- Completed: {YYYY-MM-DD}
- Model: Kimi K2.7 Code
- Branch: feature/refactor-use-vp-pack-for-library-build
- Polished: {YYYY-MM-DD}

## 目的

`vite-plus` のライブラリ向けビルドコマンドである `vp pack` を導入し、ビルドツールチェインを vp コマンドで統一する。
現在の `vp build` でも npm publish に支障はないが、`vp pack` はライブラリ公開に特化しており、型定義の単一ファイル化や publint / attw との連携など、公開パッケージの品質担保に向いている。

## 優先度根拠

現行の `vp build` + `vite-plugin-dts` の構成で安定してビルド・公開できているため、緊急性は低い。
ただし、`vp` コマンドによる統一的なツールチェインを進める観点から対応価値があるため Low とする。

## 現状

`package.json` の `build` スクリプトは `vp build` となっており、`vite.config.ts` の `build.lib` ブロックと `vite-plugin-dts` でライブラリをビルドしている。

```json
{
  "scripts": {
    "build": "vp build",
    "watch": "vp build --watch",
    "e2e-dev": "vp dev --config e2e-tests/vite.config.ts",
    "e2e-test": "vp build && playwright test --project='chromium'",
    "e2e-test-chrome": "vp build && playwright test --project='Google Chrome*'",
    "e2e-test-edge": "vp build && playwright test --project='Microsoft Edge*'",
    "e2e-test-webkit": "vp build && playwright test --project='WebKit'"
  }
}
```

`vite.config.ts` では `build.lib.entry` に `src/sora.ts`、`formats` に `["es"]`、`fileName` に `"sora"`、`minify: true`、`target: "es2022"` を指定している。
また、`define` で `__SORA_JS_SDK_VERSION__` を注入し、`rolldownOptions.output.banner` でバナーコメントを付与している。

`vp pack` は tsdown ベースのライブラリ向けビルドコマンドで、現行の `vp build` とは以下の点で異なる。

| 項目 | `vp build` | `vp pack` |
| --- | --- | --- |
| 出力ファイル | `dist/sora.js` + 複数 `.d.ts` | `dist/sora.js` + 単一 `sora.d.ts` |
| 拡張子 | `.js` | デフォルトでは `.mjs`（`--platform browser` で `.js`） |
| minify | `vite.config.ts` の設定が反映 | デフォルト無効、`--minify` が必要 |
| target | `es2022` | デフォルト `node22.0.0`、明示が必要 |
| `__SORA_JS_SDK_VERSION__` | 自動置換 | 自動では置換されない |
| banner | 反映される | `pack.banner` で再定義が必要 |

## 設計方針

- `vite.config.ts` に `pack` ブロックを追加し、`vp pack` 用の設定を明示する
- `package.json` の `build` スクリプトを `vp pack` に変更する
- `e2e-test*` 系スクリプトも `vp build` から `vp pack` に統一する
- `publint` / `attw` の有効化は別途検討する（追加依存が必要）
- `npm-publish.yml` / `ci.yaml` は `pnpm run build` のままとし、`package.json` の変更で `vp pack` が実行されるようにする
- 既存の `vp build` 設定は `e2e-dev` などで `vp dev` を使う必要があるため、共存または段階的な移行を検討する

## 完了条件

- `vp pack` で `dist/sora.js` と `dist/sora.d.ts` が生成される
- `__SORA_JS_SDK_VERSION__` が正しく埋め込まれる
- バナーコメントが維持される
- `pnpm run build` / `pnpm run e2e-test*` が正常に動作する
- `npm-publish.yml` の Build ジョブと `ci.yaml` のビルドステップが正常に完了する
- 公開パッケージの内容が現行の `vp build` 産物と同等である

## 解決方法

1. `vite.config.ts` に `pack` ブロックを追加する

```ts
pack: {
  entry: path.resolve(import.meta.dirname, "src/sora.ts"),
  format: "esm",
  platform: "browser",
  target: "es2022",
  outDir: path.resolve(import.meta.dirname, "./dist"),
  minify: true,
  dts: true,
  clean: true,
  banner,
  define: {
    __SORA_JS_SDK_VERSION__: JSON.stringify(pkg.version),
  },
},
```

2. `package.json` の `build` スクリプトを `"vp pack"` に変更する
3. `e2e-test*` 系スクリプトの `vp build` を `vp pack` に変更する
4. 必要に応じて `publint` / `@arethetypeswrong/core` を `devDependencies` に追加し、`vp pack --publint --attw` を有効化する
5. CI / npm-publish.yml の動作確認を行う

## 関連

- issues/0039-refactor-replace-setup-node-with-setup-vp-in-workflows.md
