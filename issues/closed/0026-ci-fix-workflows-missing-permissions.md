# e2e 系 workflow 5 本に `permissions:` 宣言がなく `GITHUB_TOKEN` が過剰権限になる

- Priority: High
- Created: 2026-05-21
- Polished: 2026-06-11
- Completed: 2026-06-12
- Model: Opus 4.7
- Branch: feature/fix-workflows-permissions

## 必要性

**必要。** e2e 系 5 workflow (`e2e-test.yml` / `e2e-test-canary.yml` / `e2e-test-h265.yml` / `e2e-test-webkit.yml` / `npm-pkg-e2e-test.yml`) にトップレベル `permissions:` が無く、組織 default が `Read and write permissions` の場合 `GITHUB_TOKEN` に `contents: write` 等が暗黙付与される。サードパーティ action 経由のリポジトリ書き換えや不正 tag push → `npm-publish.yml` 発火の経路が成立しうる。加えて `npm-publish.yml` のトップレベル `id-token: write` は `build` ジョブにも継承されており過剰 (publish 2 ジョブはジョブレベルで自身の `id-token: write` を持つ)。

組織 default が `Read only` であれば即時のリスクは小さくなるが、組織設定に依存せず workflow 側で最小権限を明示する方針 (`ci.yaml` / `dependency-review.yml` と同等) に揃える。

## 目的

上記 e2e 系 5 workflow にトップレベル `permissions: contents: read` を明示宣言し、`npm-publish.yml` トップレベルから `id-token: write` を削除する (publish 2 ジョブのジョブレベル `id-token: write` は維持)。

## 優先度根拠

**High。** `npm-publish.yml` は tag push で発火するため、暗黙の `contents: write` を取得したサードパーティ action が不正 tag を push できれば誤 publish に直結する。最小権限明示は GitHub Security Best Practice であり、宣言を増やすだけで実行時挙動を変えない低リスク修正のため High で揃える。

## 現状

### `permissions:` 宣言済み

- `.github/workflows/ci.yaml:10-11` — トップレベル `contents: read`
- `.github/workflows/dependency-review.yml:10-11` — トップレベル `contents: read`
- `.github/workflows/npm-publish.yml:8-10` — トップレベル `id-token: write` + `contents: read` (本 issue で `id-token: write` を削る)
- `.github/workflows/npm-publish.yml:34-36` — `npm-publish-canary` ジョブレベル `contents: read` + `id-token: write` (維持)
- `.github/workflows/npm-publish.yml:60-62` — `npm-publish` ジョブレベル `contents: read` + `id-token: write` (維持)

### `permissions:` 宣言なし (本 issue で追加対象)

トップレベル `permissions:` が無い 5 本:

- `.github/workflows/e2e-test.yml`
- `.github/workflows/e2e-test-canary.yml`
- `.github/workflows/e2e-test-h265.yml`
- `.github/workflows/e2e-test-webkit.yml`
- `.github/workflows/npm-pkg-e2e-test.yml`

これら 5 本と `npm-publish.yml` の `slack_notify` ジョブはいずれも `permissions: actions: read` をジョブレベルで宣言済み (例: `e2e-test.yml:86-87`、`npm-publish.yml:87-88`)。GitHub Actions ではジョブレベル `permissions:` はトップレベルを**マージせず完全に置換**するため、本 issue の変更で `slack_notify` の挙動は変わらない (`actions: read` のみで `gh api` 経由通知が動作している実績は `issues/closed/0023-ci-fix-slack-notify-uses-needs-result.md` 参照)。

### `id-token: write` の継承状況 (`npm-publish.yml` 現状)

トップレベル `id-token: write` を実質的に継承しているのは `build` のみ。`npm-publish-canary` / `npm-publish` は自身でジョブレベル `id-token: write` を再宣言、`slack_notify` はジョブレベル `actions: read` で置換するため、いずれもトップレベル削除後の挙動が変わらない。`build` は OIDC を使わない (`actions/checkout` / `setup-node` / `pnpm/action-setup` / `upload-artifact` のみ) ため過剰。

## 設計方針

### e2e 系 5 本

各 workflow の `on:` ブロック末尾と `jobs:` 行の間に既存の空行が 1 行ある。この空行と `jobs:` の間に `permissions:` 2 行のみを挿入する (`ci.yaml:10-11` と同じ配置、空行は追加しない):

```yaml
permissions:
  contents: read
```

挿入対象の各ファイル `jobs:` 行 (挿入後はこの行が 2 行下にずれる):

- `e2e-test.yml:17`
- `e2e-test-canary.yml:20`
- `e2e-test-h265.yml:16`
- `e2e-test-webkit.yml:16`
- `npm-pkg-e2e-test.yml:16`

### npm-publish.yml

現状 8-10 行目の `permissions:` ブロックから 9 行目 `  id-token: write` の 1 行だけを削除し、8-9 行目に縮める:

```yaml
permissions:
  contents: read
```

`npm-publish-canary` (`:34-36`) / `npm-publish` (`:60-62`) のジョブレベル `permissions:` (`contents: read` + `id-token: write`) は維持する。`issues/0033-ci-add-npm-publish-provenance.md` で追加予定の `npm publish --provenance` が OIDC attestation 生成に `id-token: write` を要求するため、ジョブレベル宣言は 0033 の前提となる。

### 対象外

- `ci.yaml` / `dependency-review.yml` — 既に `contents: read` 宣言済み
- 各 workflow の `slack_notify` ジョブ — 既に `actions: read` 宣言済みで変更不要
- `npm-publish.yml` の publish 2 ジョブのジョブレベル `permissions:` — 0033 の前提として現状維持

## 完了条件

### コード変更

- [ ] e2e 系 5 workflow に `permissions: contents: read` を追加する
- [ ] `npm-publish.yml` トップレベルから `id-token: write` (現 9 行目) を 1 行削除する
- [ ] 他のジョブレベル `permissions:` (publish 2 ジョブ、各 `slack_notify`) は変更しない

### 検証

- [ ] `pnpm test` は SDK ソース無変更のため追加実行不要
- [ ] `actionlint` (`https://github.com/rhysd/actionlint`) で `.github/workflows/` 配下を検査し warning 0 を確認する。`.github/actionlint.yaml` は不在のためデフォルト設定で実行する。インストールは `brew install actionlint` / `go install github.com/rhysd/actionlint/cmd/actionlint@latest` / `docker run --rm -v $(pwd):/repo rhysd/actionlint -color` のいずれかでよい
- [ ] e2e 系 5 workflow は `paths:` フィルタに自身の YAML を含む (例: `e2e-test.yml:11` の `.github/workflows/e2e-test.yml`)。`feature/fix-workflows-permissions` ブランチに変更を含む commit を push すると、各 workflow が自身の paths match で発火する。`pull_request` トリガを持たないため検証目的の発火に PR 作成は不要 (`push: branches: feature/*` で発火する)。発火後、5 本全てで `actions/checkout` 含めジョブが正常終了することを確認する
- [ ] `e2e-test-h265.yml` / `e2e-test-webkit.yml` は self-hosted runner (`labels: [self-hosted, macOS, ARM64, Apple-M2-Pro]`) を使うため、push 後にキュー待ちが発生しうる。再発火が必要な場合、`workflow_dispatch:` を持つのは `e2e-test.yml` / `npm-pkg-e2e-test.yml` の 2 本のみで、残り 3 本 (canary/h265/webkit) は空コミット (`git commit --allow-empty -m 'ci: re-trigger'`) で再 push する
- [ ] 上記 push の Actions 実行ログ「Set up job」ステップを展開すると `GITHUB_TOKEN Permissions` 行が表示される (Actions タブ → 該当 run → 該当 job → `Set up job` を展開)。e2e 系 5 本のメインジョブが `Contents: read` のみ、`slack_notify` ジョブが `Actions: read` のみを持つことを確認する

### 変更履歴

- [ ] `CHANGES.md` `## develop` の `### misc` セクション内、既存 `[FIX]` 群末尾 (現在の `- [FIX] macOS の Google Chrome stable インストール ...` の次行) に追記する。種別順 CHANGE → ADD → UPDATE → FIX を守る

  ```
  - [FIX] e2e 系 workflow 5 本に permissions: contents: read を追加し、npm-publish.yml の id-token: write をトップレベルから削除する
    - @voluntas
  ```

## マージ後フォローアップ

本 issue 自体は YAML レビュー + actionlint + `feature/*` push 検証で完了とみなす。`npm-publish.yml` は tag push まで実行されないため、次回 canary tag push 時に `build` の `GITHUB_TOKEN Permissions` が `Contents: read` のみ、publish 2 ジョブが `Contents: read` + `Id Token: write` を持つことを Actions ログで確認する。

## スコープ外

- `npm-publish.yml` のタグ検証 (`issues/0024-ci-fix-npm-publish-tag-version-mismatch.md`)
- `shiguredo/github-actions` の SHA 固定 (`issues/closed/0025-ci-fix-pin-shiguredo-github-actions-sha.md` で対応不要と判定済み)
- `npm publish --provenance` 追加 (`issues/0033-ci-add-npm-publish-provenance.md`)
- Playwright flaky 検出 (`issues/0027-test-fix-flaky-hidden-by-retries.md`)
- 将来リポジトリを private 化した場合の `slack_notify` への `contents: read` 追記 (条件発生時に別 issue 化)

## マージ順

`0024 → 0026 → 0033` を推奨する。0024 と本 issue はいずれも `npm-publish.yml` を編集するが、編集箇所は競合しない (0024 は `on.tags` / `if` / 新規 `verify-version` ジョブ、本 issue はトップレベル `permissions:` の 1 行削除)。技術的には本 issue を 0024 より先にマージしても構わないが、PR レビュー一貫性のため 0024 → 0026 の順で進める。0033 は publish ジョブレベル `id-token: write` の存在を前提とし、本 issue はその宣言には触れないため `0026 → 0033` の順で問題ない。

## 解決方法

### e2e 系 5 workflow にトップレベル `permissions: contents: read` を追加

以下 5 ファイルの `on:` ブロック末尾と `jobs:` 行の間にある既存の空行と `jobs:` の間に `permissions:` / `  contents: read` の 2 行を挿入した。`ci.yaml:10-11` / `dependency-review.yml:10-11` と同じ配置・字下げで揃えている。

- `.github/workflows/e2e-test.yml`
- `.github/workflows/e2e-test-canary.yml`
- `.github/workflows/e2e-test-h265.yml`
- `.github/workflows/e2e-test-webkit.yml`
- `.github/workflows/npm-pkg-e2e-test.yml`

### `npm-publish.yml` のトップレベル `id-token: write` を削除

`.github/workflows/npm-publish.yml` のトップレベル `permissions:` ブロックから `id-token: write` の 1 行のみを削除し、`contents: read` 単独の宣言に縮めた。`verify-version` / `npm-publish-canary` / `npm-publish` / `slack_notify` ジョブのジョブレベル `permissions:` 宣言には触れていない。

### 検証

- `actionlint -color .github/workflows/*.yml .github/workflows/*.yaml` を実行した。本変更で新たな warning は発生していない (既存の `Apple-M2-Pro` ラベル warning 2 件は self-hosted runner のカスタムラベル設定不在によるもので本 issue のスコープ外。develop と同じ件数のまま)。
- SDK ソースコードを触っていないため `pnpm test` の追加実行は不要。
- 各 workflow の `paths:` フィルタに自身の YAML が含まれているため、`feature/fix-workflows-permissions` ブランチへの push で自動発火する。発火後 Actions ログの「Set up job」ステップで `GITHUB_TOKEN Permissions` が `Contents: read` のみであることを確認する。
