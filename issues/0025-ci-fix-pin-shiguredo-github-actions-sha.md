# `shiguredo/github-actions/.github/actions/slack-notify@main` が SHA 固定されておらず供給網リスクがある

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-pin-shiguredo-github-actions

## 必要性

**必要。** 本リポジトリの workflow は外部 action を `<sha> # <version>` 形式で固定しているが、`slack-notify@main` のみ ref 固定されていない。`shiguredo/github-actions` の `main` が改変された場合、`secrets.SLACK_WEBHOOK` 流出や workflow 改竄の経路が成立する。コミット `3d3e593b` で意図的に `@main` へ戻した経緯はあるが、供給網リスク低減のため SHA pinning ポリシーへ再統一する。

## 目的

`.github/workflows/` 配下 7 workflow の `slack-notify@main` を commit SHA 固定に変更し、Dependabot による更新検知を可能にする。`with:` ブロック (`status: ${{ job.status }}` 等) は変更しない。

## 優先度根拠

High。SHA pinning ポリシーから外れているのは現状 `slack-notify@main` のみ。SLACK_WEBHOOK は secret として全 workflow に渡される。npm-publish のタイミング観測と組み合わさるとサプライチェーン攻撃の窓になる。

## 現状

該当箇所 7 つ (`dependency-review.yml` は slack-notify 未使用):

| ファイル                                 | 行 (着手時) |
| ---------------------------------------- | ----------- |
| `.github/workflows/ci.yaml`              | 56          |
| `.github/workflows/npm-publish.yml`      | 91          |
| `.github/workflows/e2e-test.yml`         | 90          |
| `.github/workflows/e2e-test-canary.yml`  | 75          |
| `.github/workflows/e2e-test-h265.yml`    | 73          |
| `.github/workflows/e2e-test-webkit.yml`  | 60          |
| `.github/workflows/npm-pkg-e2e-test.yml` | 92          |

すべて:

```yaml
uses: shiguredo/github-actions/.github/actions/slack-notify@main
```

`.github/dependabot.yml:32` で `shiguredo/github-actions` は `github-actions` エコシステムの監視対象に含まれている。

## 設計方針

### 1. 固定する SHA の取得

着手時点の `shiguredo/github-actions` `main` 最新 commit を採用する。

```bash
gh api repos/shiguredo/github-actions/commits/main --jq .sha
```

2026-05-25 時点の参考値: `145407fb88527b7068762db72480c1f55715e0b1` (2026-05-06, "slack_webhook が空のときは通知をスキップする")。**実装時は必ず最新 SHA を再取得すること。**

### 2. 置換形式

本リポジトリの既存慣習 (`actions/checkout@... # v6.0.2`) に合わせる。release タグが無ければ日付コメントを使う。

```yaml
# 変更前
uses: shiguredo/github-actions/.github/actions/slack-notify@main

# 変更後 (SHA / コメントは取得値に合わせる)
uses: shiguredo/github-actions/.github/actions/slack-notify@145407fb88527b7068762db72480c1f55715e0b1 # 2026-05-06
```

### 3. 変更確認

```bash
grep -rl "shiguredo/github-actions/.github/actions/slack-notify@main" .github/workflows/
```

上記が 0 件になること。

### 4. 固定対象 commit の目視確認

固定する commit の `.github/actions/slack-notify/action.yml` が、現行 `@main` と同一の input シグネチャ (`status`, `slack_webhook`, `slack_channel`, `notify_mode` 等) を持つことを確認する。

## 完了条件

### コード変更

- [ ] 上記 7 箇所すべてで `@main` を `@<commit-sha> # <tag-or-date>` に変更する
- [ ] `with:` ブロックは一切変更しない
- [ ] `.github/dependabot.yml` は変更不要 (確認のみ)

### 検証

- [ ] `pnpm test` は SDK ソース無変更のため追加実行不要
- [ ] PR マージ後、次回 CI / E2E workflow 実行で `slack_notify` ジョブが正常終了すること
- [ ] Dependabot が `shiguredo/github-actions` 更新 PR を作成できる設定であること (`.github/dependabot.yml:32`)

### 変更履歴

- [ ] `CHANGES.md` `## develop` の `### misc` に追記する

  ```
  - [FIX] shiguredo/github-actions の slack-notify を SHA で固定して供給網リスクを下げる
    - @voluntas
  ```

## スコープ外

- `npm-publish.yml` のタグ検証 (issue 0024)
- workflow `permissions` 追加 (issue 0026)
- `shiguredo/github-actions` 側の release タグ運用整備
- slack-notify の `status: ${{ job.status }}` → `needs.*.result` 変更 (issue 0023 で不要)

## マージ順

**0024 の後、0026 の前。** 0024 → 0025 → 0026 を推奨する。
