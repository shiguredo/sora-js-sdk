# ライブラリビルドを `vp build` から `vp pack` に移行する

- Priority: Low
- Created: 2026-06-14
- Completed: {YYYY-MM-DD}
- Model: Kimi K2.7 Code
- Branch: feature/refactor-use-vp-pack-for-library-build
- Polished: 2026-06-14

## 目的

`vite-plus` のライブラリ向けビルドコマンドである `vp pack` を導入し、ライブラリビルドを `vp build` から完全に移行する。

## 現状

`package.json` の `build` / `watch` / `e2e-test*` スクリプトは `vp build` となっており、`vite.config.ts` の `build.lib` ブロックと `vite-plugin-dts` でライブラリをビルドしている。

```json
{
  "scripts": {
    "build": "vp build",
    "watch": "vp build --watch",
    "e2e-test": "vp build && playwright test --project='chromium'",
    "e2e-test-chrome": "vp build && playwright test --project='Google Chrome*'",
    "e2e-test-edge": "vp build && playwright test --project='Microsoft Edge*'",
    "e2e-test-webkit": "vp build && playwright test --project='WebKit'"
  }
}
```

`vp pack` は tsdown ベースのライブラリ向けビルドコマンドで、現行の `vp build` とは以下の点で異なる。

| 項目                      | `vp build`                             | `vp pack`                                          |
| ------------------------- | -------------------------------------- | -------------------------------------------------- |
| 出力ファイル              | `dist/sora.js` + 複数 `.d.ts`          | `dist/sora.js` + 単一 `sora.d.ts`                  |
| minify                    | `vite.config.ts` の設定が反映          | デフォルト無効、`pack.minify` で明示が必要         |
| target                    | `es2022`                               | `pack.target` で明示が必要                         |
| `__SORA_JS_SDK_VERSION__` | 自動置換                               | 自動では置換されない。`pack.define` で再定義が必要 |
| banner                    | `rolldownOptions.output.banner` で反映 | `pack.banner` で再定義が必要                       |
| dts                       | `vite-plugin-dts` で生成               | tsdown 内蔵の dts 生成を使用                       |

## 設計方針

- ルート `vite.config.ts` から `build` ブロック全体と `import dts from "vite-plugin-dts"` を削除する
- `vite.config.ts` に `pack` ブロックを追加する
- `package.json` の `build` / `watch` スクリプトを `vp pack` / `vp pack --watch` に変更する
- `e2e-test*` 系スクリプトも `vp build` から `vp pack` に統一する
- `vite-plugin-dts` は `pack.dts: true` による内蔵 dts 生成で代替し、`devDependencies` から削除する
- `npm-publish.yml` / `ci.yaml` は `package.json` の `build` スクリプトを介して間接的に `vp pack` を実行するようになる

## 完了条件

- `vp pack` で `dist/sora.js` と `dist/sora.d.ts` が生成される
- `dist/sora.js` に `__SORA_JS_SDK_VERSION__` が正しく埋め込まれている
  - jsdom 環境で `Sora.version()` が `package.json` の `version` と一致することを確認する
- `dist/sora.js` の先頭にバナーコメントが付与されている
- `dist/sora.d.ts` に `@internal` 付きのシンボルが含まれていない（`grep '@internal' dist/sora.d.ts` が空であること）
- `dist/sora.js` に `tslib` への import / require が含まれていない（`grep tslib dist/sora.js` が空であること）
- `pnpm run build` / `pnpm run watch` / `pnpm run e2e-test*` / `pnpm run test` / `pnpm run typecheck` が正常に動作する
- `npm-publish.yml` の Build ジョブと `ci.yaml` のビルドステップが正常に完了する
- `rm -rf dist && pnpm run build && npm pack --dry-run` で tarball に含まれる `dist/` 配下が `sora.js` と `sora.d.ts` のみである
- `node -e 'import("./dist/sora.js").then((m) => console.log(m.default.version()))'` がエラーなく実行できる
- E2E テスト（最低でも chromium プロジェクト）が通る
- `CHANGES.md` の `## develop` セクションに `### misc` サブセクションを新設し、変更履歴を追加する

## 解決方法

1. `vite.config.ts` から `build` ブロック全体と `import dts from "vite-plugin-dts"` を削除する
2. `vite.config.ts` に `pack` ブロックを追加する

```ts
const banner = `/**
 * ${pkg.name}
 * ${pkg.description}
 * @version: ${pkg.version}
 * @author: ${pkg.author}
 * @license: ${pkg.license}
 **/
`;

export default defineConfig({
  // ... envDir / root / test / lint / fmt 等の既存設定 ...
  define: {
    __SORA_JS_SDK_VERSION__: JSON.stringify(pkg.version),
  },
  pack: {
    entry: {
      sora: path.resolve(import.meta.dirname, "src/sora.ts"),
    },
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
});
```

3. `tests/sora.test.ts` に以下のテストを追加する

```ts
import Sora from "../src/sora";
import pkg from "../package.json" with { type: "json" };

test("Sora.version() が package.json の version と一致する", () => {
  expect(Sora.version()).toBe(pkg.version);
});
```

4. `package.json` の `scripts` を以下のように変更する

```json
{
  "build": "vp pack",
  "watch": "vp pack --watch",
  "e2e-test": "vp pack && playwright test --project='chromium'",
  "e2e-test-chrome": "vp pack && playwright test --project='Google Chrome*'",
  "e2e-test-edge": "vp pack && playwright test --project='Microsoft Edge*'",
  "e2e-test-webkit": "vp pack && playwright test --project='WebKit'"
}
```

5. `pnpm remove -D vite-plugin-dts` を実行し、`pnpm-lock.yaml` を更新する
6. `CHANGES.md` の `## develop` セクションに `### misc` サブセクションを新設し、以下を追加する

```markdown
### misc

- [CHANGE] ライブラリビルドを `vp build` から `vp pack` に移行する
  - @voluntas
```

7. CI / npm-publish.yml の動作確認を行う

## 注意点

- `vp pack` CLI には `--define` オプションがないため、`__SORA_JS_SDK_VERSION__` は `vite.config.ts` の `pack.define` で注入する
- `vp pack` の `--fail-on-warn` はデフォルトで有効なため、警告が出た場合はビルドが失敗する。許容すべき警告がある場合は `pack.failOnWarn: false` を検討する
- `ci.yaml` の `typescript-native-preview` ジョブは `tsgo --emitDeclarationOnly` で `dist/sora.d.ts` を生成する。ローカルで `vp pack` 後に `tsgo` を実行すると `.d.ts` が上書きされるため、`npm pack --dry-run` 前には `dist` をクリーンして `vp pack` を再実行する

## 関連

- issues/0039-refactor-replace-setup-node-with-setup-vp-in-workflows.md
