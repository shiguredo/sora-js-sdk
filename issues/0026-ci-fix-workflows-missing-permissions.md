# e2e 系 workflow 5 本に `permissions:` 宣言がなく `GITHUB_TOKEN` が過剰権限になる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-workflows-permissions

## 目的

`.github/workflows/e2e-test.yml`、`.github/workflows/e2e-test-canary.yml`、`.github/workflows/e2e-test-h265.yml`、`.github/workflows/e2e-test-webkit.yml`、`.github/workflows/npm-pkg-e2e-test.yml` の 5 本にはトップレベル / ジョブレベル両方で `permissions:` 宣言が無い。GitHub の組織 / リポジトリ default permission 設定で `GITHUB_TOKEN` に `contents: write` 等が暗黙的に付与されると、サードパーティ action 経由でリポジトリ書き換えやリリーストリガ送信が可能になる。最小権限原則 (Principle of Least Privilege) で `permissions: contents: read` を全 workflow に明示宣言する。

合わせて、`npm-publish.yml` のトップレベル `permissions:` に `id-token: write` が宣言されている (`.github/workflows/npm-publish.yml:8-10`) が、これは npm publish ジョブだけが必要とする権限なのでジョブレベルに限定する。

## 優先度根拠

High。GitHub のリポジトリ設定で「Workflow permissions」が default `Read and write permissions` に設定されている組織では、本 5 本の workflow が暗黙的に `contents: write` を持ってしまう。サプライチェーン経由で `develop` を書き換えたり、不正な tag を打って `npm-publish.yml` を発火させたりする経路が成立する。CI ワークフローで最小権限を明示するのは GitHub Security Best Practice の基本。

## 現状

`.github/workflows/ci.yaml` はトップレベルで `permissions:` 宣言済み (確認済み)。

以下 5 本は宣言なし:

- `.github/workflows/e2e-test.yml`
- `.github/workflows/e2e-test-canary.yml`
- `.github/workflows/e2e-test-h265.yml`
- `.github/workflows/e2e-test-webkit.yml`
- `.github/workflows/npm-pkg-e2e-test.yml`

各 workflow の `slack_notify` ジョブは `permissions: actions: read` をジョブレベルで宣言している (例: `e2e-test.yml:88` 周辺) ため、`slack_notify` 単体では既に最小権限になっている。問題は `slack_notify` 以外のジョブ (`e2e-test`、`npm-pkg-e2e-test` 等) で `permissions:` 宣言がなく、default 権限に依存していること。

`npm-publish.yml:8-10`

```yaml
permissions:
  id-token: write
  contents: read
```

トップレベルで `id-token: write` を宣言しているが、これは `npm-publish-canary` / `npm-publish` ジョブで OIDC を使った npm provenance のために必要な権限。`build` ジョブや `slack_notify` ジョブには `id-token: write` は不要なので、トップレベルを `contents: read` のみに絞り、`id-token: write` は publish ジョブにジョブレベルで限定する。

## 完了条件

- 上記 5 本の workflow の冒頭 (`on:` の直後または `jobs:` の直前) に次のブロックを追加する
  ```yaml
  permissions:
    contents: read
  ```
- 各 workflow の `slack_notify` ジョブはすでに `permissions: actions: read` を持っているため変更不要 (確認のみ)
- `.github/workflows/npm-publish.yml` のトップレベル `permissions:` を次のように修正する
  ```yaml
  permissions:
    contents: read
  ```
  `id-token: write` を削除し、`npm-publish-canary` ジョブと `npm-publish` ジョブのジョブレベル `permissions:` (現状 `contents: read` と `id-token: write` を両方持つ) はそのままにする
- 動作確認: PR トリガで 5 本の workflow + `npm-publish.yml` (canary publish) が正常終了することを確認する。`actions/checkout` は `contents: read` だけで動作するため、`contents: read` 縮小で壊れるジョブは無い想定だが念のため
- CHANGES.md `## develop` の `### misc` セクションに次のエントリを追記する

  ```
  ### misc

  - [FIX] e2e 系 workflow 5 本に permissions: contents: read を追加し、npm-publish.yml の id-token: write をジョブレベルに限定する
    - @voluntas
  ```

- 本 issue は issue 0023 (slack-notify status)、issue 0024 (npm-publish.yml 構造変更)、issue 0025 (shiguredo SHA pinning) と同じ workflow 群を編集するため、マージ順は 0023 → 0024 → 0025 → 0026 を推奨する

## 解決方法

各 e2e 系 workflow 5 本の冒頭に次のブロックを追加する。位置は `on:` ブロックの直後、`jobs:` の直前。`ci.yaml` 既存の構造に揃える。

```yaml
permissions:
  contents: read
```

例として `.github/workflows/e2e-test.yml` の場合 (`on:` ブロック直後):

```yaml
name: e2e-test

on:
  workflow_dispatch:
  push:
    # (既存)
  schedule:
    # (既存)

permissions:
  contents: read

jobs:
  e2e-test:
    # (既存)
```

`.github/workflows/npm-publish.yml:8-10` を次の通り書き換える。

```yaml
permissions:
  contents: read
```

`npm-publish-canary` (`:34-36` 周辺) と `npm-publish` (`:60-62` 周辺) のジョブレベル `permissions:` は既存通り `contents: read` と `id-token: write` の両方を持つ形を維持する。

```yaml
npm-publish-canary:
  runs-on: ubuntu-slim
  needs: [build]
  permissions:
    contents: read
    id-token: write
  # (既存)

npm-publish:
  runs-on: ubuntu-slim
  needs: [build]
  permissions:
    contents: read
    id-token: write
  # (既存)
```

`build` ジョブは `contents: read` のみで OK (トップレベルから継承)。
