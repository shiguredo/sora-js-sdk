# GitHub Actions の actions/setup-node を voidzero-dev/setup-vp に置き換える

- Priority: Low
- Created: 2026-06-08
- Model: Sonnet 4.6
- Branch: feature/refactor-replace-setup-node-with-setup-vp-in-workflows

## 目的

全 GitHub Actions ワークフローで `actions/setup-node` + `pnpm/action-setup` という 2 ステップ構成を `voidzero-dev/setup-vp` に統一し、`sora-devtools` との一貫性を保つ。
`vp` コマンド（`vp install` / `vp build` / `vp check` / `vp test run` / `vp exec`）を使うことで pnpm スクリプトの呼び出しを統一できる。

## 優先度根拠

機能・バグ影響はないが、`sora-devtools` との一貫性のために対応する。緊急性はないため Low。

## 現状

以下 7 ファイルすべてで `actions/setup-node` + `pnpm/action-setup` を使用し、コマンドは `pnpm` 直呼び出しになっている。

| ファイル                                           | 主なコマンド                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yaml`                        | `pnpm install`, `pnpm run build`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`      |
| `.github/workflows/e2e-test.yml`                   | `pnpm install`, `pnpm run build`, `pnpm exec playwright`                                      |
| `.github/workflows/e2e-test-canary.yml`            | `pnpm install`, `pnpm run build`, `pnpm exec playwright`                                      |
| `.github/workflows/e2e-test-h265.yml`              | `pnpm install`, `pnpm run build`, `pnpm exec playwright`                                      |
| `.github/workflows/e2e-test-webkit.yml`            | `pnpm install`, `pnpm run build`, `pnpm exec playwright install`, `pnpm exec playwright test` |
| `.github/workflows/npm-publish.yml` (Build ジョブ) | `pnpm install`, `pnpm run build`, `pnpm run lint`, `pnpm run typecheck`                       |
| `.github/workflows/npm-pkg-e2e-test.yml`           | `pnpm install`, `pnpm add`, `pnpm exec playwright`                                            |

`sora-devtools` では `voidzero-dev/setup-vp` に統一済みで、`pnpm/action-setup` は不要になっている。

## 設計方針

- `actions/setup-node` を `voidzero-dev/setup-vp` に置き換える
  - `node-version` パラメータはそのまま渡す（マトリクスを使うワークフローは `${{ matrix.node }}` を維持する）
- `pnpm/action-setup` はユーザー指示通り残す（setup-vp は pnpm を含まないため）
- `pnpm` コマンドを以下の対応で `vp` コマンドに置き換える

| 変更前                           | 変更後               |
| -------------------------------- | -------------------- |
| `pnpm install --frozen-lockfile` | `vp install`         |
| `pnpm run build`                 | `vp build`           |
| `pnpm run lint`                  | `vp lint`            |
| `pnpm run typecheck`             | `vp typecheck`       |
| `pnpm run test`                  | `vp test run`        |
| `pnpm exec playwright`           | `vp exec playwright` |

- `npm-publish.yml` の publish ステップ（`npm publish`）は npm を使っており変更しない
- `ci.yaml` の `pnpm add -E -D typescript@${{ matrix.typescript }} -w`（TypeScript バージョン差し替え）は pnpm 直呼び出しのまま維持する

## 完了条件

- 全対象ワークフローで `actions/setup-node` が `voidzero-dev/setup-vp` に置き換わっている
- 全対象ワークフローで `pnpm` コマンドが `vp` コマンドに置き換わっている（上記例外を除く）
- CI・E2E テスト・npm publish の各ワークフローが正常に動作する
