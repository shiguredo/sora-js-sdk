# `npm-publish.yml` のタグトリガが緩くタグと package.json の不整合で誤 publish される

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-npm-publish-tag-validation

## 目的

`.github/workflows/npm-publish.yml:3-6` の `on.push.tags: "*"` は任意のタグで publish を発火させる。`package.json` の `version` フィールドとタグ名の整合性検証ジョブもない。canary 判定は `contains(github.ref, 'canary')` (`:37, :63`) という緩い文字列マッチで、`v2025.2.1-canary-test` や `feature-canary-foo` のような任意文字列にもマッチして canary 経路に乗る (もしくは外す) 可能性がある。リリース担当者の誤タグ操作で過去版が latest に再 publish されると npm 規約上取り返しがつかない (同名同 version の再 push は禁止、unpublish も 72 時間以降は不可) ため、構造的に誤 publish を防ぐ。

## 優先度根拠

High。npm の publish は副作用が大きく、外部依存を持つ全ユーザーに即座に影響する。リリース運用者の誤操作で過去版が latest に再 publish された場合、`npm unpublish` の 72 時間制限を過ぎると永久に履歴が残る。間違った dist を latest に置くと SDK 利用者の本番影響が出る。

## 現状

`.github/workflows/npm-publish.yml:3-6`

```yaml
on:
  push:
    tags:
      - "*"
```

`:37` `if: ${{ contains(github.ref, 'canary') }}`、`:63` `if: ${{ !contains(github.ref, 'canary') }}`。`github.ref` は `refs/tags/<tag-name>` 形式 (例: `refs/tags/2025.2.1-canary.0`)、`github.ref_name` はタグ名のみ (例: `2025.2.1-canary.0`)。`contains(github.ref, 'canary')` は ref 文字列内に `canary` が含まれるかを見るため、`refs/tags/feature-canary-foo` などタグ名以外の文字列にも引っかかる可能性がある (実際には `refs/tags/` 以下しか入らないが、タグ名自体に `canary` を含めれば canary 経路に乗る) 。

`package.json` の `version` フィールドとタグ名の照合は全く無い。`v2025.2.0` というタグを誤って `2025.1.9` の commit に打って push すると、`package.json: 2025.1.9` のまま `npm publish` が走り、`2025.1.9` のコードが `2025.2.0` のメタデータとして npm に上がる事故が起きうる (実際は `npm publish` 自体は `package.json.version` を使うため `2025.1.9` として publish されるが、タグと publish された version が不一致になる)。

GitHub Actions の filter pattern (`on.push.tags`) は POSIX BRE の `[0-9]+` のような繰り返し量子化はサポートしない。サポートされるのは glob (`*` `**` `?` `[]` `!`) のみ。したがってタグ名の厳密な正規表現一致は workflow filter では実現できず、別途 verify ジョブでスクリプトベースのチェックを行うのが現実的。

## 完了条件

- `.github/workflows/npm-publish.yml:3-6` の `tags: "*"` を、本リポジトリのリリース命名規約 (`YYYY.x.y` および `YYYY.x.y-canary.N`) に近い glob に絞る。GitHub Actions filter pattern の制約を考慮し、`tags: "[0-9][0-9][0-9][0-9].[0-9]*.[0-9]*"` と `tags: "[0-9][0-9][0-9][0-9].[0-9]*.[0-9]*-canary.[0-9]*"` の 2 つで列挙する。`v` プレフィックスは sora-js-sdk の既存タグでは使われていない (CHANGES.md の `## 2025.2.0` 記法と整合) ため glob にも含めない
- `build` ジョブの前に `verify-version` ジョブを新設し、`jq -r .version package.json` と `${{ github.ref_name }}` を比較して一致しなければ exit 1 する。`npm-publish-canary` / `npm-publish` の両ジョブはこの `verify-version` を `needs:` に加える
- canary 判定の `contains(github.ref, 'canary')` を `contains(github.ref_name, '-canary.')` に変更する。`-canary.<N>` パターンに完全一致しないと canary 扱いされない (`feature-canary-foo` や `-canary-test` のような変則タグは弾かれる)
- `npm-publish` ジョブ (非 canary) も同様に `!contains(github.ref_name, '-canary.')` に揃え、`github.ref` ではなく `github.ref_name` を見るように統一する
- 動作確認: 実機 publish は失敗時の影響が大きいため、PR 上で `pull_request` トリガを一時的に追加してテスト実行することはせず、コードレビューで `verify-version` の挙動を `act` または手動 dry-run で確認する
- CHANGES.md `## develop` の `### misc` セクションに次のエントリを追記する

  ```
  ### misc

  - [FIX] npm-publish workflow のタグトリガを厳格化し package.json の version とタグ名の一致を verify-version ジョブで検証する
    - @voluntas
  ```

- 本 issue は issue 0023 (slack_notify の status 修正) と同じ `npm-publish.yml` を編集するため、マージ順は 0023 → 0024 を推奨する。0023 が `slack_notify` ジョブ内の 1 行を変えるだけなので、0024 でジョブ構造を追加 (`verify-version` 追加、`needs` の更新) してもコンフリクト解消は容易
- 本 issue ではプロビナンス (`npm publish --provenance --access public`) は扱わない。別 issue として `issues/SEQUENCE` から採番して雛形を作成し、`SEQUENCE` を +1 する

## 解決方法

`.github/workflows/npm-publish.yml` を次の通り書き換える。

```yaml
name: npm-publish

on:
  push:
    tags:
      - "[0-9][0-9][0-9][0-9].[0-9]*.[0-9]*"
      - "[0-9][0-9][0-9][0-9].[0-9]*.[0-9]*-canary.[0-9]*"

permissions:
  id-token: write
  contents: read

jobs:
  verify-version:
    name: Verify tag matches package.json version
    runs-on: ubuntu-slim
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - name: Verify tag matches package.json version
        run: |
          PKG_VERSION=$(jq -r .version package.json)
          TAG_NAME=${GITHUB_REF_NAME}
          if [ "$PKG_VERSION" != "$TAG_NAME" ]; then
            echo "Tag (${TAG_NAME}) does not match package.json version (${PKG_VERSION})"
            exit 1
          fi

  build:
    name: Build
    needs: [verify-version]
    runs-on: ubuntu-slim
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: 22
      - uses: pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093 # v6.0.8
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run lint
      - run: pnpm run typecheck
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: sora-js-sdk-dist
          path: dist/

  npm-publish-canary:
    runs-on: ubuntu-slim
    needs: [build]
    permissions:
      contents: read
      id-token: write
    if: ${{ contains(github.ref_name, '-canary.') }}
    steps:
      # 既存ステップ (artifact download → npm publish --tag canary) は変更なし
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - name: Download Artifact
        uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        with:
          name: sora-js-sdk-dist
          path: dist/
      - run: npm install -g npm@latest
      - run: npm publish --no-git-checks --tag canary

  npm-publish:
    runs-on: ubuntu-slim
    needs: [build]
    permissions:
      contents: read
      id-token: write
    if: ${{ !contains(github.ref_name, '-canary.') }}
    steps:
      # 既存ステップ (artifact download → npm publish) は変更なし
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - name: Download Artifact
        uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        with:
          name: sora-js-sdk-dist
          path: dist/
      - run: npm install -g npm@latest
      - run: npm publish --no-git-checks

  slack_notify:
    # 0023 で status を needs.*.result に変更する想定
    needs: [npm-publish-canary, npm-publish]
    runs-on: ubuntu-slim
    if: ${{ !cancelled() }}
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

`verify-version` ジョブの失敗で `build` 以降のジョブはすべて skip される。canary タグ (`2025.2.1-canary.0` 等) は `verify-version` を通った上で `npm-publish-canary` のみ走る。non-canary タグは `npm-publish` のみ走る。
