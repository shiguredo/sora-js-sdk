# typedoc 生成物を GitHub Pages にデプロイする workflow を追加する

- Priority: Low
- Created: 2026-06-22
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/add-typedoc-github-pages-deploy
- Polished: 2026-06-22

## 目的

`vp run doc` で生成する typedoc 出力 (`apidoc/`) を、SDK リポジトリ単独で GitHub Pages (`https://shiguredo.github.io/sora-js-sdk/`) に配信する GitHub Actions workflow `.github/workflows/deploy-apidoc.yml` を追加する。現在内部ドキュメント管理リポジトリの `source/extra/apidoc/` に手動コピーして配信している運用を、本 issue で SDK 側の自動配信に切り替え、コピー作業を排除する。

## 優先度根拠

Low。現行運用 (内部ドキュメント管理リポジトリ側への手動コピー) は機能上止まっているわけではなく緊急性は無い。SDK と doc の同期が手作業に依存している構造上のリスクは存在するが、実際に乖離した過去事例は本 issue 起票時点では未特定で、リスクは推測の域を出ない。実装コストは中程度 (workflow 1 本 + 手作業) の一方、ユーザー影響は間接的なため Low。

## 現状

### typedoc 設定

- `package.json` の `doc` script は `typedoc` を呼ぶだけ (`:39`)
- `typedoc.json` の `entryPoints` は `./src/sora.ts`、出力先は `apidoc/`、`readme` は `./TYPEDOC.md`、`disableSources: true`、`excludePrivate: true`、`excludeProtected: true`
- typedoc 生成物 `apidoc/` の出力構造はディレクトリ `assets/`, `interfaces/`, `types/`, `variables/` と、ルートのファイル `index.html`, `modules.html`, `hierarchy.html`, `.nojekyll` (typedoc が自動生成)。`index.html` がルートにあるため GitHub Pages にそのまま配信できる
- `typedoc.json` の `entryPoints` がソース直接 (`./src/sora.ts`) なので、typedoc 実行に dist の事前ビルドは不要 (`vp install` 後に `vp run doc` で完結)
- `tsconfig.json` の型解決は `vp install --frozen-lockfile` 後の dependencies で揃う

### 配信運用

- 生成された `apidoc/` を内部ドキュメント管理リポジトリの `source/extra/apidoc/` に手動コピーしている
- 内部ドキュメント管理リポジトリ側でビルド時に apidoc が最終配信物に組み込まれ、Cloudflare Pages 経由で配信されている
- リポジトリ Settings > Pages は現時点で **未有効化** (Source 未設定)
- `SoraConnection` は src/sora.ts では `class` 宣言だが、`export type` で再 export されるため typedoc は `interfaces/SoraConnection.html` に出力する (`classes/` ディレクトリは生成されない)
- 現在の `apidoc/` 全体サイズは 1.7 MB (2026-06-22 時点の実測値。GitHub Pages の artifact 制限 1 GB の 0.2 % 未満。SDK の API 拡張に応じて増減する)

### 既存 workflow の規約

- `.github/workflows/` は計 8 本 (`ci.yaml`, `dependency-review.yml`, `e2e-test.yml`, `e2e-test-canary.yml`, `e2e-test-h265.yml`, `e2e-test-webkit.yml`, `npm-pkg-e2e-test.yml`, `npm-publish.yml`)
- runner は `ubuntu-slim` 統一
- action は SHA pinning。`actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3`、`voidzero-dev/setup-vp@ca1c46663915d6c1042ae23bd39ab85718bfb0fa # v1.10.0` が定着
- Slack 通知は `shiguredo/github-actions/.github/actions/slack-notify@main` を `slack_channel: sora-js-sdk` / `notify_mode: failure_and_fixed` で利用
- workflow 内に `pnpm` 直叩きは無く、0039 (closed, commit `7f8cb0c6`) で `voidzero-dev/setup-vp` + `vp` 経由に統一済み
- 既存 workflow に `concurrency` 設定は無い

### npm-publish.yml のタグパターン

`.github/workflows/npm-publish.yml` `:5-7` のタグトリガーは以下の 2 行:

```yaml
tags:
  - "[0-9][0-9][0-9][0-9].[0-9]*.[0-9]*"
  - "[0-9][0-9][0-9][0-9].[0-9]*.[0-9]*-canary.[0-9]*"
```

## 設計方針

### ファイル名

`.github/workflows/deploy-apidoc.yml` に確定する。過去 (2023-01-05 〜 2024-02-21、commit `652f2ce6` / PR #490 commit `b8811334`、CHANGES.md `:433`) に `deploy-pages.yml` が存在したが、これは demo / example 配信用で E2E テスト整備時に削除済み。本 issue は API ドキュメント配信用で目的が異なるため、過去ファイル名との混同を避けるため `deploy-apidoc.yml` を採用する。

### トリガー

- `push.tags`: stable リリースタグのみ。canary は除外する。

  ```yaml
  on:
    push:
      tags:
        - "[0-9][0-9][0-9][0-9].[0-9]*.[0-9]*"
    workflow_dispatch:
  ```

  canary を **除外する理由**: GitHub Pages は最後にデプロイされた artifact で上書き配信される (環境名 `github-pages` で 1 セットしか保持されない)。canary タグは短期間に大量発火するため、含めると stable リリース doc が canary doc に上書きされ、公開リファレンスが「実装中の canary 版」になる。stable リリースに合わせた doc 配信に絞る。

- `workflow_dispatch`: 手動キック用。develop ブランチから直接 dispatch すると `github.ref_name` は `develop` になる。本番配信 (`https://shiguredo.github.io/sora-js-sdk/`) を develop 由来の typedoc で上書きしないため、技術ガードを 2 段で入れる:
  1. **deploy ジョブに `if: startsWith(github.ref, 'refs/tags/')` を付ける**。workflow_dispatch では build ジョブまでで止め、deploy / slack_notify は走らせない。これで dispatch 経由の本番上書きを防げる
  2. **Settings > Environments の `github-pages` 環境に Deployment branches 制約を設定する** (タグ `[0-9][0-9][0-9][0-9].*` のみ許可)。workflow_dispatch ガードの二重防御。手作業手順に含める

### runner

`ubuntu-slim` 統一 (既存 workflow と揃える)。`actions/deploy-pages` の `ubuntu-slim` 動作実績は本リポジトリでは未検証。失敗時のフォールバック手順は「マージ後検証」セクションに記載。

### Node / vp

`voidzero-dev/setup-vp` で `node-version: 22` を指定。typedoc の出力は Node ランタイムバージョンに依存せず (型解析が主)、公開する API doc は単一バージョンで足りるため matrix にせず 22 固定とする。22 を選ぶ根拠は `package.json` の `engines.node: ">=22.18.0"` および `npm-publish.yml` build ジョブで採用済のバージョンに揃えるため。pnpm は vp が自動 download するため `pnpm/action-setup` は不要 (memory にも記録あり)。

### typedoc 実行

`vp run doc` で `package.json` の `doc` script (`typedoc`) を呼び出す (`pnpm doc` を workflow から直叩きしない、0039 整合)。dist 事前ビルドは不要 (`typedoc.json` の `entryPoints` がソース直接)。typedoc が失敗した場合は build ジョブが赤になり、`needs: [build]` で deploy / slack_notify は走らない (build 単独失敗時の通知は GitHub Actions の標準通知に依る)。

### ジョブ構成

build ジョブと deploy ジョブを分け、`actions/upload-pages-artifact` / `actions/deploy-pages` 公式パターンに従う。

- **build ジョブ**: checkout → setup-vp → `vp install --frozen-lockfile` → `vp run doc` → `actions/upload-pages-artifact` で `apidoc/` をアップロード
- **deploy ジョブ**: `actions/deploy-pages` で配信。`environment.name: github-pages` を設定し、deploy ジョブのみ `pages: write` + `id-token: write` を付与。`if: startsWith(github.ref, 'refs/tags/')` で workflow_dispatch では実行しない

`actions/upload-pages-artifact` の `path` のデフォルトは `_site` のため、`path: apidoc` を **必ず明示** する (省略すると `_site` ディレクトリを探しに行って失敗する)。artifact 名は `github-pages` 固定で `actions/deploy-pages` が自動で参照する。

### permissions (ジョブ別)

トップレベルは `contents: read` (public リポジトリの tag checkout に十分)。各ジョブの追加権限は完成形 YAML に従う。slack_notify ジョブの `actions: read` は `shiguredo/github-actions/.github/actions/slack-notify@main` が前ジョブの conclusion を `actions/github-script` 経由で取得するため必須 (`npm-publish.yml:117` と同じ)。

### concurrency

```yaml
concurrency:
  group: pages
  cancel-in-progress: false
```

`cancel-in-progress: false` は GitHub Pages 公式推奨 (進行中の deploy を中断せず順次完了させる)。

### SHA pinning

- `actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3` (既存と揃える)
- `voidzero-dev/setup-vp@ca1c46663915d6c1042ae23bd39ab85718bfb0fa # v1.10.0` (既存と揃える)
- `actions/upload-pages-artifact` および `actions/deploy-pages` の SHA は実装時に最新リリースから取得する。取得手順は (1) `gh release view --repo actions/upload-pages-artifact --json tagName` で最新リリースタグを確認、(2) `gh api repos/actions/upload-pages-artifact/git/refs/tags/<TAG> --jq '.object.sha'` で当該タグの commit SHA を取得 (`actions/deploy-pages` も同様)。`@<SHA> # <TAG>` 形式で記述し、本 issue のコード変更チェックボックスに採用した SHA を編集して埋める

### Slack 通知

最終ジョブとして以下を付ける (`npm-publish.yml` などと揃える)。`needs: [deploy]` で `if: ${{ !cancelled() }}` を付けるため、deploy が失敗しても発火する (`failure_and_fixed` モードで失敗 / 復旧通知)。一方、`workflow_dispatch` で deploy が skip された場合は skip 連鎖で slack_notify も skip される (手動 dispatch 時の Slack 通知は不要のため意図通り)。

```yaml
slack_notify:
  needs: [deploy]
  runs-on: ubuntu-slim
  if: ${{ !cancelled() }}
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

### workflow_run で npm-publish 完了を待つ案 (採用しない)

`workflow_run` で npm publish 完了後に doc を配信する連動は技術的には可能だが、npm publish と doc 配信は順序依存が無く、両 workflow が同じタグ push を独立に受け取る方が単純なため採用しない。

### `actions/configure-pages` を使わない理由

`actions/deploy-pages` v4 以降は内部で `configure-pages` 相当の処理を行うため、build ジョブで明示的に呼ぶ必要はない。本 issue でも省略する。

### 完成形 workflow (例)

```yaml
name: deploy-apidoc

on:
  push:
    tags:
      - "[0-9][0-9][0-9][0-9].[0-9]*.[0-9]*"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-slim
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
      - uses: voidzero-dev/setup-vp@ca1c46663915d6c1042ae23bd39ab85718bfb0fa # v1.10.0
        with:
          node-version: 22
      - run: vp install --frozen-lockfile
      - run: vp run doc
      - uses: actions/upload-pages-artifact@<SHA> # vX.Y.Z
        with:
          path: apidoc

  deploy:
    runs-on: ubuntu-slim
    needs: [build]
    if: startsWith(github.ref, 'refs/tags/')
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@<SHA> # vX.Y.Z

  slack_notify:
    needs: [deploy]
    runs-on: ubuntu-slim
    if: ${{ !cancelled() }}
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

## 完了条件

### 着手前確認

- [ ] `vp install --frozen-lockfile` 後にローカルで `vp run doc` を実行し、`apidoc/index.html` が生成され主要ページ (`interfaces/SoraConnection.html`, `modules.html`, `hierarchy.html`) が描画されることを確認する
- [ ] `du -sh apidoc/` で出力サイズを実測して記録する (現状は 1.7 MB。GitHub Pages の artifact 制限 1 GB の 0.2 % 未満)
- [ ] `actions/upload-pages-artifact` と `actions/deploy-pages` の最新リリース SHA を取得し、本 issue のコード変更チェックボックスに採用 SHA を編集で埋める

### コード変更

- [ ] `.github/workflows/deploy-apidoc.yml` を「完成形 workflow (例)」の構成で新規作成する
- [ ] `actions/upload-pages-artifact@<採用 SHA> # <vX.Y.Z>` に確定する
- [ ] `actions/deploy-pages@<採用 SHA> # <vX.Y.Z>` に確定する
- [ ] 他の workflow ファイル・`package.json`・`typedoc.json`・`TYPEDOC.md` は無編集

### リポジトリ管理権限保持者 (@voluntas) の手作業

本 issue では @voluntas (リポジトリ管理権限保持者) が以下を実施する。

- [ ] GitHub リポジトリ Settings > Pages を以下に変更する
  - Source: `GitHub Actions`
  - Custom domain: 設定しない (`shiguredo.github.io/sora-js-sdk` のまま運用)
  - Enforce HTTPS: 有効 (デフォルトで有効になる想定)
- [ ] Settings > Environments の `github-pages` 環境 (`actions/deploy-pages` 初回実行時に自動作成) で **Deployment branches and tags** に `Selected branches and tags` を選び、`Add deployment branch or tag rule` ダイアログで **`Ref type: Tag` を選択** してタグパターン `[0-9][0-9][0-9][0-9].*` を許可ルールに追加する (branch rule と混同しないこと。workflow_dispatch ガードの二重防御)

### merge 前検証

- [ ] `workflow_dispatch` を develop から手動キックし、build ジョブが緑になることを確認する。deploy ジョブは `if: startsWith(github.ref, 'refs/tags/')` で skip される (deploy / slack_notify ジョブは実行されない)
- [ ] build ジョブのログで `actions/upload-pages-artifact` が `apidoc/` を artifact として正常にアップロードしていることを確認する (workflow_dispatch では artifact が残置されるが、retention は actions/upload-pages-artifact のデフォルトで自動失効し、次回 tag push で同名 `github-pages` artifact が上書きされるため運用上の懸念なし)

### マージ後 (初回 stable タグ push 時) 検証

- [ ] 次回 stable リリースタグ push 時に workflow が自動発火し、build → deploy → slack_notify が全て緑になることを確認する
- [ ] `https://shiguredo.github.io/sora-js-sdk/` でルート (`index.html`)・`interfaces/SoraConnection.html`・`modules.html`・`hierarchy.html` が 200 で表示されることを確認する
- [ ] canary タグ push 時に本 workflow が **発火しない** ことを確認する (タグパターン除外の確認)
- [ ] deploy ジョブが `ubuntu-slim` で `actions/deploy-pages` を完走できることを確認する。失敗した場合は **deploy ジョブのみ `ubuntu-latest`** に切り替える PR を別途出す

### 変更履歴

- [ ] `CHANGES.md` の `## develop` セクションに `### misc` の `[ADD]` として以下相当の 1 行を追加する (具体的な文面は実装時にコミット内容に合わせて確定)

  ```
  - [ADD] typedoc 生成物を GitHub Pages にデプロイする workflow を追加する
    - @voluntas
  ```

  `- @voluntas` 行はリストネスト 1 段。挿入位置は既存 `[ADD]` 群の末尾。

## 失敗時のロールバック

- 本 workflow の merge を revert する PR を出す
- GitHub Pages 配信を一時停止する場合は Settings > Pages の Source を `None` に変更する (deploy-pages の最新 artifact 配信が停止する)

## スコープ外 (本 issue では実装しない)

内部ドキュメント管理リポジトリ側の後続作業のみ。本 issue マージ → GitHub Pages 配信稼働確認 → 以下着手の順序で進める (先に着手すると doc 側のリンクが切れる期間が発生する)。本 issue の完了判定には含めない。

- a. 内部ドキュメント管理リポジトリ側の `source/extra/apidoc/` 削除と `.gitignore` 追記
- b. 内部ドキュメント管理リポジトリ側の `/apidoc/...` 絶対パスリンクを `https://shiguredo.github.io/sora-js-sdk/...` に書き換える作業 (a と同 issue に統合可)

## 関連 issue

- **0064 (open)**: TYPEDOC.md を API ドキュメントの表紙として刷新する。本 issue マージ後 (Pages 配信稼働後) に着手する想定
- **0065 (open)**: `typedoc.json` の `intentionallyNotExported` を `@internal` + `excludeInternal: true` に置き換える。本 issue マージ後に着手する想定
- **0039 (closed, commit `7f8cb0c6`)**: `actions/setup-node` → `voidzero-dev/setup-vp` 置換。本 issue は 0039 マージ後の方針 (`vp run` 経由) に準拠する
