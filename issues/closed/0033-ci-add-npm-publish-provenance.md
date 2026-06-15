# npm-publish.yml の publish 2 経路に `--provenance` を追加する

- Priority: Low
- Created: 2026-05-25
- Completed: 2026-06-15
- Polished: 2026-06-12
- Model: Composer 2.5
- Branch: feature/add-npm-publish-provenance

## 必要性

**任意**。0024 (タグ検証) / 0026 (workflow permissions 最小化) で publish 経路の構造的ガードを終えた後の運用改善で、SDK の実行時挙動は変えない。npm の supply chain attack 対策として publish artifact の出所 (provenance attestation) を npm registry 側に残し、利用者が `npm audit signatures` や npmjs.com の Provenance バッジで検証できる状態にする。

## 目的

`.github/workflows/npm-publish.yml` の publish 2 経路 (`npm-publish-canary` / `npm-publish`) に `--provenance` フラグを追加し、GitHub Actions から publish した artifact の provenance attestation を npm registry に登録する。

## 優先度根拠

Low。リリース信頼性の向上であり SDK の機能・実行時挙動には影響しない。0024 で誤 publish の構造的ガードが完了し、0026 で workflow 権限が最小化された現在、追加の防御層として provenance を導入する位置付け。

## 現状

`.github/workflows/npm-publish.yml` (0024 commit `ef427ce0` / 0026 commit `772d1d81` マージ後の確定状態) の publish コマンド:

- `npm-publish-canary` ジョブ (`:77`): `npm publish --no-git-checks --tag canary`
- `npm-publish` ジョブ (`:103`): `npm publish --no-git-checks`

リポジトリ内の関連 grep 結果 (`grep -rn -E "provenance|NPM_TOKEN|NODE_AUTH_TOKEN|publishConfig" .github/ package.json`) はすべて 0 件。`provenance` / `publishConfig.provenance` 未設定、token publish 用 secret も無し。現状の publish 認証は npm Trusted Publishing (OIDC) 経由を前提とする (publish ジョブのジョブレベル `id-token: write` は 0026 マージ済)。

**provenance attestation 生成の要件と充足状況:**

| 要件                                                                                              | 現状                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm CLI バージョン: Trusted Publishing 全体は npm 11.5.1+、`--provenance` フラグ自体は npm 9.5.0+ | 充足。両 publish ジョブで `npm install -g npm@latest` を実行 (着手前確認で再検証)                                                                               |
| Node.js バージョン: Trusted Publishing 全体は Node 22.14.0+                                       | 充足見込み。`actions/setup-node@v6.4.0` の `node-version: 22` で 22 系の最新が解決される (着手前確認で再検証)                                                   |
| public パッケージ                                                                                 | 充足。`package.json` `name` は `sora-js-sdk` (scope 無し)、`private` 未設定                                                                                     |
| public リポジトリ                                                                                 | 充足。`shiguredo/sora-js-sdk` は public。provenance は private リポジトリでは生成されない                                                                       |
| `package.json` の `repository.url` がリポジトリを指す                                             | 充足。`git+https://github.com/shiguredo/sora-js-sdk.git`                                                                                                        |
| publish ジョブの `id-token: write`                                                                | 充足。`npm-publish-canary` (`:56-58`) / `npm-publish` (`:82-84`) でジョブレベルに `contents: read` + `id-token: write` 宣言済 (0026 でトップレベルからは削除済) |

**provenance と `--provenance` フラグの関係:** npm 公式 (`https://docs.npmjs.com/generating-provenance-statements`) は Trusted Publishing 経路では provenance が自動生成され `--provenance` フラグは不要とする。本 issue では **workflow ファイルだけ読んで provenance 付き publish と分かるよう意図を明文化する** ため明示的にフラグを付ける (フラグ重複でエラーにはならない)。dist-tag (`canary` / `latest`) は provenance 生成と独立しており、どちらの経路でも attestation は生成される (npm registry 側は dist-tag を見ない)。

## 前提条件 (リポジトリ外作業)

本 PR を merge する前に、npmjs.com 側で Trusted Publishing を以下の設定で完了させる。未設定のまま merge すると、次回タグ push 時点で publish が OIDC 認証段階で失敗する。

- npmjs.com → Package `sora-js-sdk` → Settings → Trusted Publishing
- Publisher: GitHub Actions
- Repository: `shiguredo/sora-js-sdk`
- Workflow filename: `npm-publish.yml`
- Environment: 空欄 (`npm-publish.yml` 内に `environment:` 宣言が無いため、npm 側で「環境制約なし」となる)

`https://docs.npmjs.com/trusted-publishers` によれば Trusted Publisher の subject claim は workflow filename + (optional) environment ベースで、job 名 (`npm-publish-canary` / `npm-publish`) は含まれない。`npm-publish.yml` 1 件の登録で両 publish ジョブが同じ Trusted Publisher 設定でカバーされる。

確認担当: npmjs.com の `sora-js-sdk` 管理権限保持者 (本リポジトリでは @voluntas。以下「リリース実施者」と呼ぶ)。確認は npmjs.com の Package Settings → Trusted Publishing 画面で目視する (過去の publish ログだけでは、過去に個人 token で publish していた可能性を排除できず TP 設定の証拠にはならない)。

## 設計方針

publish 2 経路の publish コマンドに `--provenance` を **末尾** で追記する。trailing 追加なので 1 行内 diff が `... --tag canary` → `... --tag canary --provenance` のように読みやすい (`--no-git-checks` の位置を動かさない)。

### 1. canary publish ステップ (`npm-publish-canary` ジョブ、`:77`)

```yaml
# 変更前
- run: npm publish --no-git-checks --tag canary
# 変更後
- run: npm publish --no-git-checks --tag canary --provenance
```

### 2. latest publish ステップ (`npm-publish` ジョブ、`:103`)

```yaml
# 変更前
- run: npm publish --no-git-checks
# 変更後
- run: npm publish --no-git-checks --provenance
```

他のステップ・ジョブ (`verify-version` / `build` / `slack_notify` / 各 `setup-node` / `npm install -g npm@latest` / artifact 系 step / 各 `permissions:`) はすべて無編集 (詳細は完了条件参照)。`actions/setup-node@v6.4.0` の `registry-url: https://registry.npmjs.org` (`:66` / `:92`) は `.npmrc` への `registry=` 設定生成のため必要で、本 issue でも維持する。

参考:

- `https://docs.npmjs.com/generating-provenance-statements`
- `https://docs.npmjs.com/trusted-publishers`
- `https://docs.npmjs.com/cli/v11/commands/npm-audit` (`audit signatures` で provenance 検証)

## 完了条件

### 着手前確認

- [ ] npmjs.com の `sora-js-sdk` Package Settings → Trusted Publishing 画面で、Repository `shiguredo/sora-js-sdk` / Workflow filename `npm-publish.yml` / Environment 空欄 で設定完了していることを目視確認する (前提条件セクション参照)
- [ ] ローカルで `npm view npm version` を実行し、現行の `npm@latest` が `11.5.1+` であることを確認する
- [ ] 直近の他 workflow (`ci.yaml` / `e2e-test.yml` 等。`ci.yaml` は matrix の `node: 22` job、`e2e-test.yml` も同様に node 22 を使うため対象。これらは push で発火するため着手前に確認可能) の Actions ログから、`actions/setup-node@v6.4.0` の `node-version: 22` (matrix 経由を含む) が解決する Node が `22.14.0+` であることを確認する。`npm-publish.yml` 自体の publish 実行ログは本番 publish をトリガするため使わない

### コード変更

- [ ] `.github/workflows/npm-publish.yml:77` を `npm publish --no-git-checks --tag canary --provenance` に変更する
- [ ] `.github/workflows/npm-publish.yml:103` を `npm publish --no-git-checks --provenance` に変更する
- [ ] 上記 2 箇所以外 (トップレベル `permissions` / ジョブレベル `permissions` / `verify-version` / `build` / `slack_notify` / 各 `setup-node` / `npm install -g npm@latest` / artifact 系 step) は無編集
- [ ] `package.json` も無編集 (`repository.url` / `name` / `private` 設定は provenance 前提として既に充足、`publishConfig.provenance` はスコープ外で扱う)

### 検証

- [ ] PR diff で `--provenance` の末尾追加が 2 箇所のみで、それ以外の変更が無いことをレビューで確認する
- [ ] 0026 由来のジョブレベル `id-token: write` (`:58` / `:84`) が残存していることをレビューで確認する (本 issue では新たに追加しない)
- [ ] 本 PR 自身は publish workflow をトリガしないため、provenance 動作の確認はマージ後の next canary tag push 時に行う (下記マージ後フォローアップ)
- [ ] 本 PR マージと CHANGES.md 追記が完了した時点で本 issue は close する。下記マージ後フォローアップは継続タスクとしてリリース実施者が担当する (本 issue マージ後の最初の canary push まで close を保留すると、その期間中の他 issue 着手の障害になるため close は待たない)

### 変更履歴

- [ ] `CHANGES.md` `## develop` の `### misc` セクションに以下を追記する。挿入位置は既存 `- [ADD] CI に @typescript/native-preview による型検証ジョブを追加する` の直下 (種別順 CHANGE → ADD → UPDATE → FIX を維持し、`[ADD]` 群の末尾に置く)

  ```
  - [ADD] npm publish に --provenance を追加して supply chain 透明性を向上させる
    - @voluntas
  ```

  `- @voluntas` 行は半角スペース 2 個分のインデント (リストネスト 1 段) を入れる。

## マージ後フォローアップ

次回 canary tag push (`2026.1.0-canary.2` 以降を想定。先に minor bump が来る場合は `2026.X.0-canary.0`) のタイミングでリリース実施者が以下を確認する。

### 動作確認

初回 canary publish 後は以下 3 項目をフルで確認する。以降の canary push および初回 latest publish (`2026.X.0` 形式のタグ push) では、publish ジョブ success と Provenance バッジ表示のみを確認する縮減運用で足りる。

- [ ] 該当 publish ジョブログに `npm notice Signed provenance statement with source and build information from GitHub Actions` 行と `npm notice Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=<n>` 行が出力されること (npm CLI のバージョンで表記揺れがありうるため、GitHub Actions UI の log search または `gh run view <run-id> --log | grep -E "provenance statement|sigstore"` で確認する)
- [ ] 別環境で `npm install sora-js-sdk@<version>` 後、`npm audit signatures --json --include-attestations` を実行し provenance が検証されること
- [ ] npmjs.com の `sora-js-sdk` package ページの該当 version 行に `Provenance` バッジが表示されること

### 失敗時の復旧手順

失敗パターンに応じて以下の通り切り分ける。いずれの場合もリリース実施者が判断と対応を行う。

1. **publish 自体が failed (OIDC 認証エラー / Trusted Publishing 未設定等)**: npm 側にバージョンは登録されない。タグを `git tag -d <tag>` / `git push --delete origin <tag>` で削除し、原因 (TP 設定漏れ等) を解消後、`package.json` の `version` を `<canary>.<n+1>` に bump して同名タグを push する。0024 で導入された `verify-version` ジョブが `package.json` の version と tag 一致を要求するため、`package.json` 更新と tag は同期させる
2. **publish は success だが attestation が付与されなかった (登録されたが provenance だけ欠落)**: npm registry に version が既に登録され、同名再 publish は不可。`npm unpublish` は npm のガイドラインに反するため使わない。タグはそのまま保持し、`package.json` を `<canary>.<n+1>` に bump して次回 push で再試行する。並行して、リリース実施者が本リポジトリに原因調査用の bug 系 issue を起票する
3. **publish success かつ attestation 付与済**: 通常完了。`slack_notify` ジョブも通常パスで動く

## スコープ外

- `--no-git-checks` フラグの削除 (0024 closed のスコープ外項目「0033 で provenance 導入時に併せ検討」の本 issue での再評価結論): npm CLI のフラグ一覧 (`https://docs.npmjs.com/cli/v11/commands/npm-publish`) に `--no-git-checks` は存在せず、現状 `npm warn Unknown cli config "--git-checks". This will stop working in the next major version of npm.` の warning が出ている。**npm v12 で publish が break する**ため、本 issue マージ後にリリース実施者が refactor カテゴリで別途起票する (本 issue 内では削除しない)
- `package.json` の `publishConfig.provenance: true` 設定: CLI フラグ方式と挙動は等価。本 issue は workflow に閉じた変更にとどめ、`package.json` の `publishConfig` には触らない (ローカルで `npm publish` を誤実行した場合に意図せず provenance 経路に入るのを避けるため)
- workflow 内の `npm install -g npm@latest` 重複 (`:76` と `:102`) の共通化: DRY 違反だがスコープ外
- `actions/setup-node` から `setup-vp` への置換は issue 0039 で扱う
- `slack_notify` ジョブの編集 (`:105-118`): 0023 (closed, invalid) で「`status: ${{ job.status }}` のままで slack-notify Composite Action 側が自動検出する」と決着済み

## 関連 issue

- **0024 (closed, commit `ef427ce0`)**: タグ検証 (`verify-version` ジョブ新設) の上流。本 issue の前提
- **0026 (closed, commit `772d1d81`)**: workflow permissions 最小化の上流。publish ジョブレベル `id-token: write` を本 issue が利用する
- **0039 (open)**: `actions/setup-node` を `setup-vp` に置換。本 issue とは編集箇所が異なり競合しないため、本 issue → 0039 の順を推奨
- **`--no-git-checks` 削除 issue (未起票)**: 本 issue マージ後にリリース実施者が refactor カテゴリで起票予定 (スコープ外セクション参照)

## 解決方法

`.github/workflows/npm-publish.yml` の publish 2 経路の `npm publish` コマンドに `--provenance` フラグを末尾追加した。

- `npm-publish-canary` ジョブ (`:77`): `npm publish --no-git-checks --tag canary` → `npm publish --no-git-checks --tag canary --provenance`
- `npm-publish` ジョブ (`:103`): `npm publish --no-git-checks` → `npm publish --no-git-checks --provenance`

設計方針セクションで指示された通り、フラグは末尾に追加して 1 行内 diff を読みやすくし、`--no-git-checks` の位置は変更しない。他のステップ・ジョブ (`verify-version` / `build` / `slack_notify` / 各 `setup-node` / `npm install -g npm@latest` / artifact 系 step / 各 `permissions:`) は無編集。`package.json` も無編集。

完了条件のコード変更 3 項目はすべて充足。検証 4 項目のうち PR diff の確認とジョブレベル `id-token: write` の残存確認はレビューで充足。マージ後の動作確認 (Provenance バッジ表示・`npm audit signatures` での検証等) はマージ後フォローアップセクションに沿って次回 canary tag push 時にリリース実施者が実施する。
