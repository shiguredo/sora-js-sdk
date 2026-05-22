# `shiguredo/github-actions/.github/actions/slack-notify@main` が SHA 固定されておらず供給網リスクがある

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-pin-shiguredo-github-actions

## 目的

`.github/workflows/` 配下の workflow は外部 action (例: `actions/checkout`、`actions/setup-node`、`actions/upload-artifact`、`pnpm/action-setup`、`actions/download-artifact`) をすべて `<sha> # <version>` 形式で SHA 固定しているが、`shiguredo/github-actions/.github/actions/slack-notify@main` のみ `@main` で参照している。`shiguredo/github-actions` リポジトリの `main` が改変・侵害された瞬間、本リポジトリの全 workflow で改変済み slack-notify が実行され、`secrets.SLACK_WEBHOOK` の流出やリリースタイミング・成果物の改竄経路が成立する。Dependabot で更新検知できる形に `<sha>` で固定する。

## 優先度根拠

High。SHA pinning ポリシーから外れているのは現状の workflow 群で `slack-notify@main` だけ。SLACK_WEBHOOK が secret として渡され、Webhook URL を握れば本プロジェクトの全 Slack 通知に任意メッセージを送れる。さらに npm-publish のタイミングを観測すれば、リリース直後のサプライチェーン攻撃 (バージョンタグ確認 → 攻撃者が同タグ commit に切り替え → 等) の窓を作れる。`shiguredo/github-actions` は自社管理リポジトリだが、社内アカウント侵害 / リポジトリ書き込み権限漏れの 1 経路で同じ事故が起きる。

直近の git log (`b77d51c3 e2e-test の runner を windows-2025-vs2026 に切り替え playwright test ステップに 15 分の timeout を設定する`、`3d3e593b shiguredo/github-actions の slack-notify を @main に戻し upload-artifact コメントを v7.0.1 に更新する`、`65a6f96a GitHub Actions をコミット SHA で固定し CodeQL ワークフローを削除する`) を見ると、本リポジトリは 65a6f96a で全 action を SHA 固定したが、3d3e593b で `shiguredo/github-actions` だけ `@main` に戻した経緯がある。意図的な巻き戻しと思われるが、本 issue でポリシーに揃え直す。

## 現状

該当箇所は 7 つ:

- `.github/workflows/ci.yaml:56`
- `.github/workflows/npm-publish.yml:91`
- `.github/workflows/e2e-test.yml:90`
- `.github/workflows/e2e-test-canary.yml:75`
- `.github/workflows/e2e-test-h265.yml:73`
- `.github/workflows/e2e-test-webkit.yml:60`
- `.github/workflows/npm-pkg-e2e-test.yml:92`

すべて `uses: shiguredo/github-actions/.github/actions/slack-notify@main`。

`.github/dependabot.yml:32` で `shiguredo/github-actions` は `github-actions` エコシステムの監視対象に既に含まれている。SHA pinning に戻れば Dependabot から自動更新 PR が来る。

## 完了条件

- 上記 7 箇所すべてで `@main` を `@<commit-sha> # <tag-name-or-date>` の SHA pinning 形式に変更する。SHA は本 issue 着手時の `shiguredo/github-actions` の `main` 最新コミット (もしくは安定タグの commit) を採用する
- `# <tag-name-or-date>` のコメントは本リポジトリの既存 workflow の慣習 (例: `actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2`) に揃える。`shiguredo/github-actions` に release タグがあればそれ、無ければ日付 (`# 2026-05-21`) を入れる
- `.github/dependabot.yml:32` で `shiguredo/github-actions` が監視対象に含まれていることを確認する (既存の確認のみ、変更不要)
- 動作確認は SHA 固定後の workflow が CI 等で正常に動くことを通常の PR トリガで確認する。`shiguredo/github-actions` の `slack-notify` Composite Action の `action.yml` シグネチャが安定していることが前提なので、SHA 固定対象の commit が現行 `@main` と同じ Composite Action を提供していることを目視で確認する
- CHANGES.md `## develop` の `### misc` セクションに次のエントリを追記する

  ```
  ### misc

  - [FIX] shiguredo/github-actions の slack-notify を SHA で固定して供給網リスクを下げる
    - @voluntas
  ```

- 本 issue は issue 0023 / 0024 と同じ workflow ファイル群を編集するため、マージ順は 0023 → 0024 → 0025 を推奨する。0023 が `status` 値、0024 が npm-publish.yml の構造変更、0025 が `uses:` 行の SHA pinning でそれぞれ別行を編集するためコンフリクトは少ないが、`npm-publish.yml:91` は 0023 と同行近辺なので注意

## 解決方法

`shiguredo/github-actions` の `main` 最新 commit SHA を取得する。

```bash
gh api repos/shiguredo/github-actions/commits/main --jq .sha
```

取得した SHA (例: `abcdef0123456789abcdef0123456789abcdef01`) と、対応する release タグまたは取得日付を組み合わせて、7 箇所を一括置換する。

```yaml
# 変更前
uses: shiguredo/github-actions/.github/actions/slack-notify@main

# 変更後 (SHA とコメントは取得値に合わせる)
uses: shiguredo/github-actions/.github/actions/slack-notify@abcdef0123456789abcdef0123456789abcdef01 # 2026-05-21
```

`grep -rl "shiguredo/github-actions/.github/actions/slack-notify@main" .github/workflows/` で 7 ファイル全てに確実に変更が入ったことを確認する。

Dependabot は SHA pinning + コメント付き action を検出して、`shiguredo/github-actions` の `main` 更新検知時に自動で PR を作成する設定が既に効いている (`.github/dependabot.yml:32` の `shiguredo/github-actions` 設定)。

`shiguredo/github-actions` に release タグを切る作業は本リポジトリの範囲外。`shiguredo/github-actions` 側でリリース運用を整える issue は別途扱う。本 issue では `main` の最新 commit SHA で固定するだけに留める。
