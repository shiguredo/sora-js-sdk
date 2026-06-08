# .oxlintrc.jsonc と .oxfmtrc.jsonc を vite.config.ts へ統合する

- Priority: Low
- Created: 2026-06-08
- Model: Sonnet 4.6
- Branch: feature/refactor-merge-oxlintrc-oxfmtrc-into-vite-config

## 目的

`.oxlintrc.jsonc` と `.oxfmtrc.jsonc` の設定を `vite.config.ts` に統合し、設定ファイルを一元管理する。
`sora-devtools` では `vite.config.ts` の `lint` / `fmt` セクションに全設定を統合済みであり、同じ方針に揃える。

## 優先度根拠

機能・バグ影響はないが、設定ファイルの分散は保守コストを高める。`sora-devtools` との一貫性を保つためにも統合することが望ましい。緊急性はないため Low。

## 現状

`vite.config.ts` には `lint` と `fmt` の部分的な設定のみが存在し、詳細なルールは外部ファイルに分離されている。

```
.oxfmtrc.jsonc      → fmt.ignorePatterns のみ記載
.oxlintrc.jsonc     → plugins / categories / rules を詳細に記載
vite.config.ts      → lint.ignorePatterns と lint.options のみ、fmt.ignorePatterns のみ
```

`sora-devtools` の `vite.config.ts` では `lint` セクションに `plugins` / `categories` / `rules` が完全に統合されており、`.oxlintrc.jsonc` は存在しない。

## 設計方針

1. `.oxlintrc.jsonc` の内容 (`plugins` / `categories` / `rules`) を `vite.config.ts` の `lint` セクションへ移植する
2. `.oxfmtrc.jsonc` の `ignorePatterns` は `vite.config.ts` の `fmt` セクションへ移植する（すでに重複して記載されているため確認のうえ整理する）
3. 移植完了後、`.oxlintrc.jsonc` と `.oxfmtrc.jsonc` を削除する
4. `sora-devtools` の統合例を参考にする

## 完了条件

- `.oxlintrc.jsonc` と `.oxfmtrc.jsonc` が削除されている
- `vite.config.ts` の `lint` / `fmt` セクションに全設定が統合されている
- `pnpm run lint` と `pnpm run fmt` が正常に動作する
- CI が通過する
