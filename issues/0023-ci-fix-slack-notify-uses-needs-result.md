# 全 workflow の Slack 通知が `status: ${{ job.status }}` で failure を一切検知できない

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-ci-slack-notify-needs-result

## 目的

`.github/workflows/` 配下の `ci.yaml`、`npm-publish.yml`、`e2e-test.yml`、`e2e-test-canary.yml`、`e2e-test-h265.yml`、`e2e-test-webkit.yml`、`npm-pkg-e2e-test.yml` の `slack_notify` ジョブが全て `status: ${{ job.status }}` を `shiguredo/github-actions/.github/actions/slack-notify` に渡している。`${{ job.status }}` は実行中のジョブ (= `slack_notify` ジョブ自身) の状態を返すため、`needs:` 側のジョブが failure でも `slack_notify` ジョブ自身は何も失敗していないので `success` が渡る。`notify_mode: failure_and_fixed` のため、Slack 通知が一切発火しない構造になっている。各 workflow で `needs.<job>.result` (単一 needs) または `contains(needs.*.result, 'failure') && 'failure' || 'success'` (複数 needs) に置き換える。

## 優先度根拠

High。CI の失敗もリリースの失敗も Slack に通知されないため、開発者が気付かないうちに develop が壊れた状態で進行する。さらに本リポジトリの他 issue 群で修正したバグの CI 検証結果も通知が来ないため、修正効果の確認が遅れる。CI / リリース運用の致命的な機能不全。

## 現状

各 workflow の `slack_notify` ジョブの該当行:

- `.github/workflows/ci.yaml:58` `status: ${{ job.status }}` (`needs: [ci]`)
- `.github/workflows/npm-publish.yml:83-` (`needs: [npm-publish-canary, npm-publish]`)
- `.github/workflows/e2e-test.yml:82-` (`needs: [e2e-test]`)
- `.github/workflows/e2e-test-canary.yml:67-` (`needs: [e2e-test-canary]`)
- `.github/workflows/e2e-test-h265.yml:65-` (`needs: [e2e-test-h265]`)
- `.github/workflows/e2e-test-webkit.yml:52-` (`needs: [e2e-test-webkit]`)
- `.github/workflows/npm-pkg-e2e-test.yml:84-` (`needs: [npm-pkg-e2e-test]`)

例として `.github/workflows/ci.yaml:48-61`:

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

`${{ job.status }}` は GitHub Actions の式言語仕様 (`context.job.status`) で「現在実行中のジョブ自身の状態」を返す。`slack_notify` 自身は通知ステップしか持たないため、ほぼ常に `success` を返す。`needs: [ci]` 側のジョブが `failure` でも `slack_notify` には `success` が渡るため、`notify_mode: failure_and_fixed` の判定は「success → 前回 failed なら fixed、それ以外は無通知」となり、結果として失敗時に通知が出ない。

`if: ${{ !cancelled() && github.actor != 'dependabot[bot]' }}` で cancelled は除外されているが、`needs:` ジョブが failure / skipped でも `!cancelled()` は true のため `slack_notify` ジョブは走る。走るが status 評価が間違っているため通知が発火しない、というのが現状の挙動。

`shiguredo/github-actions` の `slack-notify` Composite Action 側で `needs.*.result` を集約するロジックを持たせる案もあるが、本 issue では呼び出し側 (sora-js-sdk の workflow) で `needs` の集約式を書く方針とする。Composite Action 側の改修は別 issue として `shiguredo/github-actions` リポジトリで扱う。

## 完了条件

- 上記 7 つの workflow すべてで `slack_notify` ジョブの `status` 値を次の通り変更する
  - `ci.yaml:58`: `status: ${{ needs.ci.result }}`
  - `npm-publish.yml`: `status: ${{ contains(needs.*.result, 'failure') && 'failure' || 'success' }}` (複数 needs)
  - `e2e-test.yml`: `status: ${{ needs.e2e-test.result }}` (単一 needs だがハイフン入りジョブ名は引用が必要な場合あり、`needs['e2e-test'].result` と書く方が安全)
  - `e2e-test-canary.yml`: `status: ${{ needs['e2e-test-canary'].result }}`
  - `e2e-test-h265.yml`: `status: ${{ needs['e2e-test-h265'].result }}`
  - `e2e-test-webkit.yml`: `status: ${{ needs['e2e-test-webkit'].result }}`
  - `npm-pkg-e2e-test.yml`: `status: ${{ needs['npm-pkg-e2e-test'].result }}`
- `needs.<job>.result` の取り得る値は `success` / `failure` / `cancelled` / `skipped`。`if: !cancelled()` で cancelled は除外しているが、`skipped` (例えば dependabot 経由で needs ジョブが if 条件で skip されたケース) は `failure` 扱いされないことを slack-notify Composite Action が想定しているか、本 issue 着手時に確認する。`shiguredo/github-actions` 側の `slack-notify` README で `status` 引数の許容値を確認する
- 動作確認は意図的に CI ジョブを失敗させて Slack 通知が発火することを確認する。確認手順を `.github/workflows/README.md` (新規または既存) に「failing test を一時的にコミットして slack-notify の発火を確認する手順」として残す
- CHANGES.md `## develop` の `### misc` セクションに次のエントリを追記する (機能影響なし、CI workflow の修正のため misc)

  ```
  ### misc

  - [FIX] CI / リリース / E2E workflow の slack_notify が needs.*.result ではなく job.status を見ていたため失敗通知が発火しなかったのを修正する
    - @voluntas
  ```

- 本 issue は CI workflow の修正のみで SDK のソースコードには触らないため、他 issue とのコンフリクトはない

## 解決方法

各 workflow の `slack_notify` ジョブの `status` 値を完了条件のとおり変更する。

`.github/workflows/ci.yaml:48-61` の例:

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
        status: ${{ needs.ci.result }}
        slack_webhook: ${{ secrets.SLACK_WEBHOOK }}
        slack_channel: sora-js-sdk
        notify_mode: failure_and_fixed
```

`.github/workflows/npm-publish.yml` (複数 needs):

```yaml
slack_notify:
  needs: [npm-publish-canary, npm-publish]
  runs-on: ubuntu-slim
  if: ${{ !cancelled() && github.actor != 'dependabot[bot]' }}
  permissions:
    actions: read
  steps:
    - name: Slack Notification
      uses: shiguredo/github-actions/.github/actions/slack-notify@main
      with:
        status: ${{ contains(needs.*.result, 'failure') && 'failure' || 'success' }}
        slack_webhook: ${{ secrets.SLACK_WEBHOOK }}
        slack_channel: sora-js-sdk
        notify_mode: failure_and_fixed
```

ハイフン入りジョブ名 (`e2e-test`、`e2e-test-canary`、`e2e-test-h265`、`e2e-test-webkit`、`npm-pkg-e2e-test`) は `needs.e2e-test.result` のドット記法でも参照できるが、安全のため `needs['e2e-test'].result` のブラケット記法で統一する。

`shiguredo/github-actions/.github/actions/slack-notify@main` 側で `status` 引数が `success` / `failure` / `cancelled` のいずれかを期待しており `skipped` の扱いが不明な場合は、`status: ${{ needs['e2e-test'].result == 'success' && 'success' || (needs['e2e-test'].result == 'failure' && 'failure' || 'cancelled') }}` のようにマッピング式を入れる選択肢もある。本 issue 着手時に `slack-notify` Composite Action の `action.yml` を確認した上で判断する。
