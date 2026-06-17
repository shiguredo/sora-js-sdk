# 【対応不要】`shiguredo/github-actions` は時雨堂自身が提供するため供給網リスクの想定が当てはまらない

- Priority: High
- Created: 2026-05-21
- Completed: 2026-06-11
- Polished: 2026-06-06
- Model: Opus 4.7
- Branch: （対応不要 — ブランチ未作成）

## 目的 (撤回)

`.github/workflows/` 配下 7 workflow の `shiguredo/github-actions/.github/actions/slack-notify@main` を commit SHA に固定し、Dependabot による更新検知を可能にするという claim。供給網リスク (`main` が改変されたときの `secrets.SLACK_WEBHOOK` 流出経路) を根拠としていた。

**結論: 対応不要。workflow 変更は行わない。**

## なぜ対応不要か

`shiguredo/github-actions` は本 SDK (`shiguredo/sora-js-sdk`) と同じ **時雨堂 (shiguredo organization)** が所有・運用する自社リポジトリであり、本 issue が前提としていた「外部の第三者による上流改変 = サプライチェーン攻撃」という脅威モデルが対象に当てはまらない。

- 同一 organization 内のリポジトリのため、`main` の変更は時雨堂の内部 review プロセスで管理される
- 通常の OSS action (例: `actions/checkout`) と同じ「外部供給網」として扱う前提自体が成り立たない
- `@main` 参照のまま運用しても残るのは「自社が `main` を破壊的に書き換える内部運用ミス」というリスクで、これは self-pin (SHA 固定) では防げず、`shiguredo/github-actions` 側の運用整備で対処する範疇

`slack_webhook` が空のときは通知をスキップする (`shiguredo/github-actions` の現行実装) ため、誤改変があっても fail-closed 寄りに振る舞う。

## 解決方法

**対応不要として close する。** workflow の `uses: shiguredo/github-actions/.github/actions/slack-notify@main` 参照は維持する。CHANGES.md への追記も行わない。

issue 0024 / 0026 / 0033 に波及していた「0025 マージ順前提」「0025 で SHA 固定する」記述は、本 close に合わせて修正する。

reopen 条件: `shiguredo/github-actions` が時雨堂外の organization へ移管された、または `slack-notify` の `main` 改変によって本 SDK の workflow から secret 流出につながる事象が現実に発生した場合のみ。
