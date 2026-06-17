# 【invalid / 対応不要】Slack 通知の `needs.result` 修正は不要 — `status: ${{ job.status }}` が正しい用法

- Priority: High
- Created: 2026-05-21
- Completed: 2026-05-25
- Model: Opus 4.7
- Branch: （対応不要 — ブランチ未作成）

## 目的 (撤回)

`.github/workflows/` 配下 7 workflow (`ci.yaml`、`npm-publish.yml`、e2e 系 5 本) の `slack_notify` が `status: ${{ job.status }}` を渡しており、`needs` 側ジョブが failure でも Slack 通知が一切出ない — **`needs.*.result` に置き換える必要がある** という claim。

**結論: claim は誤り。workflow 変更は不要。**

## なぜ invalid だったか

issue 作成時に **`shiguredo/github-actions` の slack-notify Composite Action を読んでいなかった**。

slack-notify は `status: ${{ job.status }}` を渡す前提で設計されている (`action.yml` input 説明: 「別ジョブの失敗・キャンセルは自動検出」)。処理順は次の通り。

1. 呼び出し側 workflow が `status: ${{ job.status }}` を渡す (`slack_notify` 自身はほぼ常に `success`)
2. composite action 内で `status == success` のとき `gh api` により **同一 workflow run 内の全ジョブ** を走査 (`action.yml:108-122`)
3. `conclusion == failure` が 1 件でもあれば `STATUS` を `failure` に上書き
4. **その後** `notify_mode: failure_and_fixed` 判定 → failure 通知が発火

公式 README (`github-actions/README.md` 「別ジョブの失敗・キャンセル自動検出」) とテスト workflow (`test-slack-notify.yml`) も同じ `job.status` パターンを採用している。

`sora-js-sdk` は 2026-02-23 (#673) からこの action を `@main` で利用しており、自動検出機能追加と同日。issue 作成 (2026-05-21) 時点ですでに有効。

## 誤った推論

issue は「`success` が渡る → notify_mode 判定で無通知」と **`gh api` による上書き前で推論を止めていた**。また「composite action 側に集約ロジックを持たせる」案を書いていたが、**既に実装済み**だった。

`needs.*.result` への変更は必須修正ではない。任意改善に留まる (API 失敗時の明示化、`gh api` 依存の削減等)。

## 現行 workflow (変更不要)

```yaml
slack_notify:
  needs: [ci] # workflow ごとに needs ジョブ名は異なる
  permissions:
    actions: read
  steps:
    - uses: shiguredo/github-actions/.github/actions/slack-notify@main
      with:
        status: ${{ job.status }}
        slack_webhook: ${{ secrets.SLACK_WEBHOOK }}
        slack_channel: sora-js-sdk
        notify_mode: failure_and_fixed
```

Slack 通知が本当に来ない場合は、0023 ではなく次を調査する。

- `slack_webhook` が空 (Dependabot / fork PR / シークレット未設定)
- `gh api` 失敗 (`2>/dev/null` でサイレントフォールバック)
- job 自体が success (flaky が retry で吸収された等 — issue 0027 参照)

## 解決方法

**対応不要。** workflow の `status: ${{ job.status }}` は slack-notify の正しい使い方であり、変更不要。

issue 0024 / 0025 / 0026 / 0027 に波及していた「0023 前提のマージ順・Slack 不具合」記述は、本 close に合わせて削除または修正する。

reopen 条件: slack-notify から自動検出ロジックが削除された、または意図的 fail で通知が来ないことが Actions ログで確認された場合のみ。
