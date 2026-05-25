# npm publish workflow に `--provenance` を追加する

- Priority: Low
- Created: 2026-05-25
- Model: Composer 2.5
- Branch: feature/add-npm-publish-provenance

## 目的

issue 0024 では npm publish のタグ検証のみを扱う。npm の supply chain 透明性のため `npm publish --provenance` と OIDC 設定を整え、GitHub Actions から publish した artifact の出所 (provenance attestation) を npm に残す。

## 優先度根拠

Low。0024 / 0026 完了後の運用改善。**着手前条件**: npm registry 側の Trusted Publishing 設定が完了していること。未設定の状態で `--provenance` を追加すると publish が失敗する。

## 現状

`.github/workflows/npm-publish.yml` の publish コマンド (着手時):

- canary: `:55` `npm publish --no-git-checks --tag canary`
- latest: `:81` `npm publish --no-git-checks`

`actions/setup-node` は両 publish ジョブで `registry-url: https://registry.npmjs.org` を設定済み (`.github/workflows/npm-publish.yml:44`, `:70`)。

publish ジョブには既に `permissions: contents: read` + `id-token: write` がある (`:34-36`, `:60-62`)。

**0026 マージ後**: トップレベル `permissions` から `id-token: write` が除去され、publish ジョブレベルの `id-token: write` のみが残る。**0033 着手時に publish ジョブレベル権限が維持されていることを確認する**。

**認証**: リポジトリに `NPM_TOKEN` / `NODE_AUTH_TOKEN` は無い。publish は npm Trusted Publishing (OIDC) 前提。

build ジョブは artifact upload、publish ジョブは download + publish する構成。provenance attestation は **publish ジョブ** に紐づく (npm 仕様)。dist-only artifact でも問題ない。

## 設計方針

0024 / 0026 マージ後の `npm-publish.yml` に対して、publish コマンド 2 箇所を更新する。0024 で `verify-version` ジョブ追加後は行番号がずれる。`npm publish --no-git-checks` を grep して特定する。

```yaml
# canary (npm-publish-canary ジョブ)
- run: npm publish --provenance --no-git-checks --tag canary

# latest (npm-publish ジョブ)
- run: npm publish --provenance --no-git-checks
```

前提:

- `npm install -g npm@latest` ステップで npm 9.5.0+ を満たす (`--provenance` 要件)
- `setup-node` の `registry-url` 維持
- publish ジョブの `permissions.id-token: write` 維持 (0026 後)

参考: [npm provenance documentation](https://docs.npmjs.com/generating-provenance-statements)

Slack 通知 (`status: ${{ job.status }}`) は issue 0023 (closed) のとおり **変更不要**。

### npm registry 側設定 (リポジトリ外作業)

Trusted Publishing 未設定のまま `--provenance` を入れない。

チェックリスト:

1. npmjs.com → Package `sora-js-sdk` (`package.json` の `name`) → Settings → Trusted Publishing
2. Repository: `shiguredo/sora-js-sdk`
3. Workflow filename: `npm-publish.yml`
4. Environment: (未使用なら空)

初回検証は **canary タグ** publish で attestation が npm パッケージページに表示されることを確認する。

## 完了条件

- canary / latest 両経路で `npm publish --provenance --no-git-checks` (canary は `--tag canary` も維持) になる
- 0026 マージ後、publish ジョブレベルに `permissions: contents: read` + `id-token: write` があることを確認する
- npm registry 側 Trusted Publishing 設定が完了していること (上記チェックリスト)
- canary publish 後、npm 上で provenance / attestation が確認できること
- build artifact 経由 publish でも attestation が publish ジョブに紐づくこと (npm 仕様どおり)
- CHANGES.md `## develop` に次のエントリを追記する

  ```
  - [ADD] npm publish に --provenance を追加して supply chain 透明性を向上させる
    - @voluntas
  ```

### マージ順

```
0024 → 0025 → 0026 → 0033
```

0024 (タグ検証) / 0026 (permissions 最小化) 完了後に着手する。
