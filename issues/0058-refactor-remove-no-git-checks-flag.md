# `.github/workflows/npm-publish.yml` の `--no-git-checks` フラグを削除する

- Priority: Low
- Created: 2026-06-15
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/refactor-remove-no-git-checks-flag
- Polished: {YYYY-MM-DD}

## 目的

`.github/workflows/npm-publish.yml` の publish 2 経路から `--no-git-checks` フラグを削除し、現在出ている `npm warn Unknown cli config "--git-checks". This will stop working in the next major version of npm.` warning を解消する。npm v12 で publish が break する前に対処する。0033 のスコープ外セクションでリリース実施者が継続タスクとして起票することが明示されていた内容。

## 優先度根拠

Low (実質的には High だが SDK 実行時挙動に影響しないため運用カテゴリとしては Low)。現状 publish は通っているが、npm v12 で `--no-git-checks` 解釈が止まると publish 自体が break する。npm v12 のリリース時期に応じて Priority を High に上げる必要がある。

## 現状

`.github/workflows/npm-publish.yml` の publish 2 経路に `--no-git-checks` が付与されている。

- `:77` (`npm-publish-canary`): `npm publish --no-git-checks --tag canary --provenance`
- `:103` (`npm-publish`): `npm publish --no-git-checks --provenance`

npm CLI のフラグ一覧 (`https://docs.npmjs.com/cli/v11/commands/npm-publish`) に `--no-git-checks` は存在せず、publish 実行時に以下の warning が出る:

```
npm warn Unknown cli config "--git-checks". This will stop working in the next major version of npm.
```

`--no-git-checks` は本来「CI 環境で git working directory のチェックをスキップする」目的のフラグだったが、npm 公式仕様から外れており、現状の publish では事実上 no-op に近い。npm v12 ではこの警告が error に格上げされ、publish 自体が失敗する可能性が高い。

## 設計方針

以下を順に検証して決定する。

### Step 1: `--no-git-checks` の必要性確認

- 削除して publish が通るか dry-run で確認する
- npm 11.x の publish が CI 環境 (`actions/checkout` 直後のクリーンな working directory) で git working directory チェックに引っかかる挙動を取らないか確認する
- 取らないことを確認できれば単純削除する

### Step 2: 代替手段の検討 (Step 1 で削除すると問題が出る場合)

- `NPM_CONFIG_GIT_CHECKS=false` のような環境変数で代替する
- `.npmrc` に `git-checks=false` を書く
- いずれも実際に動作することを確認する

### Step 3: マージ後の検証

- 次回 canary tag push で publish が成功することを確認する
- 同 publish ログに `npm warn Unknown cli config` 行が出ないことを確認する
- 続く stable tag push でも同様に確認する

## 完了条件

- publish 2 経路 (またはジョブ統合後 0057 で 1 経路) から `--no-git-checks` が削除されている (もしくは代替手段に置き換わっている)
- `npm warn Unknown cli config "--git-checks"` warning が publish ログに出なくなる
- canary / latest publish が正常に動作する (マージ後フォローアップで確認)

## スコープ外

- workflow コメント整理 (0055 で扱う)
- `npm install -g npm@latest` 重複共通化 (0056 で扱う)
- canary / latest publish ジョブ統合 (0057 で扱う)

## 関連 issue

- 0033 (closed): スコープ外セクションで本 issue 起票を予告
- 0055 (open): workflow コメント整理
- 0056 (open): `npm install -g npm@latest` 重複共通化
- 0057 (open): canary / latest publish ジョブ統合
