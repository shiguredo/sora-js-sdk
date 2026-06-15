# `publint` と `attw` を有効化して npm パッケージ品質を検証する

- Priority: Low
- Created: 2026-06-14
- Completed: {YYYY-MM-DD}
- Model: Kimi K2.7 Code
- Branch: feature/add-publint-attw-validation
- Polished: {YYYY-MM-DD}

## 目的

`vp pack` の `publint` / `attw` オプションを有効化し、npm 公開パッケージの型定義・エントリポイント・`exports` 構成の問題を CI で検証する。

## 優先度根拠

公開パッケージの品質向上には有効だが、現状の `exports["."].require` が ESM ファイルを指すなどの既存問題が検出される可能性がある。別途対応が必要なため Low とする。

## 現状

`sora-js-sdk` では `vp pack` を導入する予定（issues/0051）だが、`publint` / `attw` は有効化されていない。
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

`require` 条件が ESM ファイル `./dist/sora.js` を指しており、`attw` や `publint` を有効化すると警告 / エラーが出る可能性がある。

## 設計方針

- `publint` / `@arethetypeswrong/core` を `devDependencies` に追加する
- `vite.config.ts` の `pack` ブロックに `publint: true` / `attw: true` を設定する
- CI で `vp pack` 実行時に検証が走るようにする
- 検出された警告 / エラーについては、許容可能なものと修正が必要なものを分類する

## 完了条件

- `pnpm run build` で `publint` / `attw` の検証が実行される
- `vp pack` のビルドが警告 / エラーなしで完了するか、許容する警告が明確に文書化されている
- CI の Build ジョブが正常に完了する
- `CHANGES.md` の `## develop` セクションの `### misc` に変更履歴が追加されている

## 解決方法

1. `pnpm add -D publint @arethetypeswrong/core` を実行する
2. `vite.config.ts` の `pack` ブロックに以下を追加する

```ts
publint: true,
attw: true,
```

3. 検出された警告 / エラーを確認し、必要に応じて `package.json` の `exports` 構成を修正する
4. 許容する警告がある場合は、`pack.publint` / `pack.attw` のオプションで制御するか、issue 内に理由を記載する
5. `CHANGES.md` の `## develop` セクションの `### misc` に以下を追加する
   - `[ADD] `vp pack`の`publint`/`attw` 検証を有効化する`

## 関連

- issues/0051-refactor-use-vp-pack-for-library-build.md
