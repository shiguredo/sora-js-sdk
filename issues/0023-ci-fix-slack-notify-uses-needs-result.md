# 全 workflow の Slack 通知が `status: ${{ job.status }}` で失敗を一切検知できない

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-ci-slack-notify-needs-result

## 目的

`ci.yaml` / `npm-publish.yml` / `e2e-test*.yml` / `npm-pkg-e2e-test.yml` のすべての `slack_notify` ジョブが `status: ${{ job.status }}` を渡している。`job.status` は **slack_notify ジョブ自身** の状態を返すため、`needs:` のジョブが failure でも slack_notify は普通に成功する → 失敗通知が一切出ない。失敗検知が機能していない構造を修正する。

## 優先度根拠

High。CI 失敗もリリース失敗も Slack に通知されない構造のため、開発者が気付かないまま develop が壊れた状態でリリースが行われる致命的な運用事故の温床。他の致命的バグ修正の効果も検証できない。

## 現状

例として `.github/workflows/ci.yaml:48-61`

```yaml
slack_notify:
  needs: [ci]
  runs-on: ubuntu-slim
  if: ${{ !cancelled() && github.actor != 'dependabot[bot]' }}
  permissions:
    actions: read
  steps:
    - name: Slack Notification
      uses: shiguredo/github-actions/.github/actions/slack-notify@main
      with:
        status: ${{ job.status }}
        slack_webhook: ${{ secrets.SLACK_WEBHOOK }}
        slack_channel: sora-js-sdk
        notify_mode: failure_and_fixed
```

`${{ job.status }}` は実行中ジョブ自身（slack_notify）の状態を返す。slack_notify ジョブ自体は何もエラーを起こさないため常に `success` を渡してしまう。`notify_mode: failure_and_fixed` のため、結果として通知が発火しない。

同種の問題が以下の全 workflow にある:

- `.github/workflows/ci.yaml:58`
- `.github/workflows/npm-publish.yml:93`
- `.github/workflows/e2e-test.yml`
- `.github/workflows/e2e-test-canary.yml`
- `.github/workflows/e2e-test-h265.yml`
- `.github/workflows/e2e-test-webkit.yml`
- `.github/workflows/npm-pkg-e2e-test.yml`

## 設計方針

`status` には `needs.<job-id>.result` を渡す。複数 needs がある場合は `${{ contains(needs.*.result, 'failure') && 'failure' || 'success' }}` のような集約式を使う。

## 完了条件

- いずれかの needs ジョブが failure のとき Slack に失敗通知が発火する
- すべて success のときは fixed 通知（previous failed の場合）または無通知
- 全 workflow で同じパターンに統一

## 解決方法

`ci.yaml:58` 例:

```yaml
status: ${{ needs.ci.result }}
```

`npm-publish.yml:93` 例（複数 needs）:

```yaml
status: ${{ (needs.npm-publish-canary.result == 'failure' || needs.npm-publish.result == 'failure') && 'failure' || 'success' }}
```

または slack-notify Composite Action 側に「needs result を集約するロジック」を持たせ、呼び出し側は `needs:` 全体を渡すだけにする設計も検討する（`shiguredo/github-actions` 側の修正）。
