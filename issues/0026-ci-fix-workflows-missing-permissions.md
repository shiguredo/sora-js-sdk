# e2e 系ワークフロー 5 本に `permissions:` 宣言がなく `GITHUB_TOKEN` が過剰権限になる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-workflows-permissions

## 目的

`e2e-test.yml` / `e2e-test-canary.yml` / `e2e-test-h265.yml` / `e2e-test-webkit.yml` / `npm-pkg-e2e-test.yml` の 5 本の冒頭に、トップレベル / ジョブレベル両方で `permissions:` 宣言が無い。リポジトリ default permission 次第で `GITHUB_TOKEN` に `contents: write` が暗黙的に付与される。サードパーティ action 経由でサプライチェーン攻撃が成立する経路を塞ぐ。

## 優先度根拠

High。`develop` ブランチを書き換える / 不正な npm-publish trigger を仕込むといった重大インシデントの可能性。最小権限原則の基本。

## 現状

`ci.yaml` は `permissions: contents: read` を宣言しているが、上記 5 本にはない。

## 設計方針

全 workflow の冒頭に `permissions: contents: read` を宣言する。`slack_notify` ジョブのみ `actions: read` を追加する。`npm-publish.yml` は `id-token: write` を publish ジョブだけに限定する（issue 0024 と関連、トップレベルでなくジョブレベルに置く）。

## 完了条件

- 全 workflow が明示的に `permissions:` を宣言
- `slack_notify` のみ `actions: read` を持つ
- `npm-publish.yml` の `id-token: write` が publish ジョブのみ

## 解決方法

各 workflow の冒頭に追加:

```yaml
permissions:
  contents: read
```

`slack_notify` ジョブで:

```yaml
slack_notify:
  permissions:
    actions: read
  ...
```

`npm-publish.yml` のトップレベル `permissions` から `id-token: write` を外し、`npm-publish-canary` / `npm-publish` ジョブで明示宣言する。
