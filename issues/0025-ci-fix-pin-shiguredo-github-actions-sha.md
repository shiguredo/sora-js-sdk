# `shiguredo/github-actions/.github/actions/slack-notify@main` が SHA 固定されていない

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-pin-shiguredo-github-actions

## 目的

他のサードパーティ action はすべて SHA 固定されているのに、自社管理の `shiguredo/github-actions` だけ `@main` 参照。`secrets.SLACK_WEBHOOK` を引数として渡しており、`main` ブランチが改変・侵害された瞬間に Webhook 流出 + npm-publish のリリースタイミング観測などのサプライチェーン経路が成立する。SHA pinning ポリシーから外れている。

## 優先度根拠

High。SHA pinning ポリシーを develop 中で「意図的に @main に戻した」コミット履歴があるが、ポリシー上のセキュリティリスクが残っている。

## 現状

該当箇所:

- `.github/workflows/ci.yaml:56`
- `.github/workflows/npm-publish.yml:91`
- `.github/workflows/e2e-test.yml:90`
- `.github/workflows/e2e-test-canary.yml:75`
- `.github/workflows/e2e-test-h265.yml:73`
- `.github/workflows/e2e-test-webkit.yml:60`
- `.github/workflows/npm-pkg-e2e-test.yml:92`

すべて `uses: shiguredo/github-actions/.github/actions/slack-notify@main`。

## 設計方針

`shiguredo/github-actions` 側で release タグを切り、`@<sha>` で全箇所固定する。Dependabot の `github-actions` 監視には既に `shiguredo/github-actions` が含まれているので、SHA pinning に戻れば自動更新検知が機能する。

## 完了条件

- 全 workflow で `@<commit-sha>` で固定される
- Dependabot から更新 PR が来るようになる
- @main 参照が 1 箇所も残らない

## 解決方法

`shiguredo/github-actions` の最新の安定 commit SHA を取得し、上記 7 箇所を一括置換する。Dependabot 設定 (`.github/dependabot.yml`) で `shiguredo/github-actions` も SHA pinning 対象に含まれていることを確認する。

SHA 取得例:

```bash
gh api repos/shiguredo/github-actions/commits/main --jq .sha
```
