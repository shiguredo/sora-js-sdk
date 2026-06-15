# Node.js エンジン要件を 22.18.0 以上に引き上げる

- Priority: Medium
- Created: 2026-06-14
- Completed: {YYYY-MM-DD}
- Model: Kimi K2.7 Code
- Branch: feature/change-raise-engines-node-to-22-18-0
- Polished: {YYYY-MM-DD}

## 目的

`tsdown` 0.22 系（`vite-plus` 0.1.24 が依存）が Node.js `< 22.18.0` のサポートを終了したため、`package.json` の `engines.node` を `>=22` から `>=22.18.0` に引き上げる。

## 優先度根拠

`vp pack` の導入（issues/0051）にあたり、ビルド時に `tsdown` が動作するためには Node.js 22.18.0 以上が必要となる。利用者への影響は限定されるが、後方互換のない変更であるため Medium とする。

## 現状

`package.json` の `engines` は以下のようになっている。

```json
"engines": {
  "node": ">=22",
  "pnpm": ">=11"
}
```

また、`.github/workflows/ci.yaml` では `node-version: 22`、`.github/workflows/npm-publish.yml` では `node-version: 22` を使用している。

`tsdown` 0.22.2 の `engines` は `^22.18.0 || >=24.0.0` となっており、`>=22` のままでは Node.js 22.0 〜 22.17 の環境で `vp pack` が動作しない。

## 設計方針

- `package.json` の `engines.node` を `">=22.18.0"` に変更する
- `.github/workflows/*.yml` の `node-version: 22` を `22.18.0` 以上に固定する
- `CHANGES.md` の `## develop` セクションに `[CHANGE]` エントリを追加する

## 完了条件

- `package.json` の `engines.node` が `">=22.18.0"` になっている
- 全対象ワークフローで `node-version` が 22.18.0 以上になっている
- CI の全ジョブが正常に完了する
- `CHANGES.md` に変更履歴が追加されている

## 解決方法

1. `package.json` の `engines.node` を `">=22.18.0"` に変更する
2. 以下のワークフローで `node-version: 22` を `22.18.0` 以上に変更する
   - `.github/workflows/ci.yaml`
   - `.github/workflows/npm-publish.yml`
   - `.github/workflows/e2e-test.yml`
   - `.github/workflows/e2e-test-canary.yml`
   - `.github/workflows/e2e-test-h265.yml`
   - `.github/workflows/e2e-test-webkit.yml`
   - `.github/workflows/npm-pkg-e2e-test.yml`
3. `CHANGES.md` の `## develop` セクションに以下を追加する
   - `[CHANGE] Node.js の最低要件を 22.18.0 以上に引き上げる`

## 関連

- issues/0051-refactor-use-vp-pack-for-library-build.md
