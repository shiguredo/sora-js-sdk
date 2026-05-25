# e2e 系 workflow 5 本に `permissions:` 宣言がなく `GITHUB_TOKEN` が過剰権限になる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-workflows-permissions

## 必要性

**必要。** e2e 系 5 workflow にトップレベル `permissions:` が無く、組織 default が `Read and write permissions` の場合 `GITHUB_TOKEN` に `contents: write` 等が暗黙付与される。サードパーティ action 経由のリポジトリ書き換えや不正 tag push → `npm-publish.yml` 発火の経路が成立しうる。加えて `npm-publish.yml` のトップレベル `id-token: write` は publish ジョブ以外にも継承されており過剰。

## 目的

e2e 系 5 workflow に `permissions: contents: read` を明示宣言し、`npm-publish.yml` の `id-token: write` を publish ジョブのジョブレベルに限定する。

## 優先度根拠

High。GitHub Security Best Practice として CI workflow への最小権限明示は必須。暗黙的 `contents: write` はサプライチェーン攻撃面を広げる。

## 現状

`permissions:` 宣言済み:

- `.github/workflows/ci.yaml:10-11` — `contents: read`
- `.github/workflows/dependency-review.yml:10-11` — `contents: read`
- `.github/workflows/npm-publish.yml:8-10` — `id-token: write` + `contents: read` (トップレベル)

`permissions:` 宣言なし (トップレベル / ジョブレベル共):

- `.github/workflows/e2e-test.yml`
- `.github/workflows/e2e-test-canary.yml`
- `.github/workflows/e2e-test-h265.yml`
- `.github/workflows/e2e-test-webkit.yml`
- `.github/workflows/npm-pkg-e2e-test.yml`

各 workflow の `slack_notify` ジョブはジョブレベルで `permissions: actions: read` を既に宣言している (例: `.github/workflows/e2e-test.yml:86-87`)。`slack_notify` 自体は変更不要。

`npm-publish.yml:8-10` (現行):

```yaml
permissions:
  id-token: write
  contents: read
```

現行 workflow は `npm publish --provenance` を使っておらず (issue 0033 で追加予定)、`build` / `verify-version` (0024 追加後) / `slack_notify` に `id-token: write` は不要。

## 設計方針

### e2e 系 5 本

`on:` ブロック直後、`jobs:` 直前に追加する (`ci.yaml` と同じ位置)。

```yaml
permissions:
  contents: read
```

対象:

- `.github/workflows/e2e-test.yml`
- `.github/workflows/e2e-test-canary.yml`
- `.github/workflows/e2e-test-h265.yml`
- `.github/workflows/e2e-test-webkit.yml`
- `.github/workflows/npm-pkg-e2e-test.yml`

### npm-publish.yml

トップレベルを次に変更:

```yaml
permissions:
  contents: read
```

`npm-publish-canary` / `npm-publish` 各ジョブのジョブレベル `permissions:` は維持:

```yaml
permissions:
  contents: read
  id-token: write
```

0024 マージ後の `verify-version` / `build` / `slack_notify` はトップレベル `contents: read` の継承のみで足りる。

## 完了条件

### コード変更

- [ ] e2e 系 5 workflow に `permissions: contents: read` を追加する
- [ ] `npm-publish.yml` トップレベルから `id-token: write` を削除する
- [ ] `npm-publish-canary` / `npm-publish` ジョブレベルの `permissions:` は現状維持 (0024 マージ後も同配置)
- [ ] 各 `slack_notify` ジョブの `permissions: actions: read` は変更不要 (確認のみ)

### 検証

- [ ] `pnpm test` は SDK ソース無変更のため追加実行不要
- [ ] PR トリガで e2e 系 workflow が `actions/checkout` 含め正常終了すること (`contents: read` で十分)
- [ ] `npm-publish.yml` は tag push まで実行されないため、permissions 変更は YAML レビュー + 0024 マージ後の構造確認で足りる

### 変更履歴

- [ ] `CHANGES.md` `## develop` の `### misc` に追記する

  ```
  - [FIX] e2e 系 workflow 5 本に permissions: contents: read を追加し、npm-publish.yml の id-token: write をジョブレベルに限定する
    - @voluntas
  ```

## スコープ外

- `npm-publish.yml` のタグ検証 (issue 0024)
- `slack-notify` SHA 固定 (issue 0025)
- `npm publish --provenance` (issue 0033)
- Playwright flaky 検出 (issue 0027)

## マージ順

**0024 / 0025 の後。** 0024 → 0025 → 0026 を推奨する。0027 とは独立だが、0027 が e2e workflow に step を追加するため 0026 完了後の方がコンフリクトが少ない。
