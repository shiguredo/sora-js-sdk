# `package.json` の `exports` の `require` 条件を見直す

- Priority: Low
- Created: 2026-06-14
- Completed: {YYYY-MM-DD}
- Model: Kimi K2.7 Code
- Branch: feature/change-exports-require-condition
- Polished: {YYYY-MM-DD}

## 目的

`package.json` の `exports["."].require` が ESM 専用の `dist/sora.js` を指しているため、`require` 経由での利用が動作しない状態を修正する。

## 優先度根拠

現状の `require` 条件は誤った状態だが、実際の利用者からの報告がなく、影響は限定的と考えられる。`publint` / `attw` を有効化する際（issues/0053）に対応が必要になるため Low とする。

## 現状

`package.json` の `exports` は以下のようになっている。

```json
"exports": {
  ".": {
    "types": "./dist/sora.d.ts",
    "import": "./dist/sora.js",
    "require": "./dist/sora.js"
  }
}
```

`sora-js-sdk` は `type: "module"` かつ ESM 専用の SDK であるため、`require` 経由で `./dist/sora.js` を読み込もうとすると Node.js ではエラーになる。

## 設計方針

以下のいずれかを選択する。

- `require` 条件を削除し、ESM のみをサポートする
- `vp pack` で CJS ビルドも生成し、`require` 条件で `./dist/sora.cjs` を指すようにする

現状の SDK はブラウザ向けであり、CJS サポートの需要が低いため、`require` 条件を削除する方針とする。CJS サポートが必要になった場合は別途検討する。

## 完了条件

- `package.json` の `exports["."]` から `require` 条件が削除されている
- `npm pack --dry-run` で公開 tarball の内容が期待通りである
- `pnpm run build` / `pnpm run test` / E2E テストが正常に動作する
- `CHANGES.md` の `## develop` セクションに `[CHANGE]` エントリが追加されている

## 解決方法

1. `package.json` の `exports["."]` から `require` 条件を削除する

```json
"exports": {
  ".": {
    "types": "./dist/sora.d.ts",
    "import": "./dist/sora.js"
  }
}
```

2. `pnpm run build` と E2E テストで動作確認を行う
3. `CHANGES.md` の `## develop` セクションに以下を追加する
   - `[CHANGE] `exports` から `require` 条件を削除し ESM のみをサポートする`

## 関連

- issues/0051-refactor-use-vp-pack-for-library-build.md
- issues/0053-add-publint-attw-validation.md
