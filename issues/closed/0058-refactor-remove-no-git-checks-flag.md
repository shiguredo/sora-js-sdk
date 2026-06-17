# `.github/workflows/npm-publish.yml` の `--no-git-checks` フラグを削除する

- Priority: Low
- Created: 2026-06-15
- Completed: 2026-06-16
- Model: Opus 4.7
- Branch: feature/refactor-remove-no-git-checks-flag
- Polished: 2026-06-16

## 目的

`.github/workflows/npm-publish.yml` の publish 2 経路から `--no-git-checks` フラグを削除し、現在 publish ログに出ている以下の warning を解消する:

```
npm warn Unknown cli config "--git-checks". This will stop working in the next major version of npm.
```

`This will stop working in the next major version of npm.` の文面から、npm v12 でこの config が解釈されなくなる可能性が高い。`--no-git-checks` がフラグ解釈エラーとなって publish 自体が失敗する前に対処する。

## 優先度根拠

Low。CI/CD インフラ系の整備で SDK の実行時挙動に影響しない。ただし npm v12 リリース後はリリース実施者にとってのリスクが急上昇するため、npm v12 の release schedule (<https://github.com/npm/cli/milestones>) が判明し次第 Medium 以上に再評価する。2026.1.0 リリース (issue 0059) の Low ブロッカー候補として、リリース前に整備しておきたい。

## 現状

`.github/workflows/npm-publish.yml` の publish 2 経路 (2026-06-16 時点の行番号、0055 / 0056 / 0057 のマージで変動しうる):

- `:77` (`npm-publish-canary` ジョブ): `npm publish --no-git-checks --tag canary --provenance`
- `:103` (`npm-publish` ジョブ): `npm publish --no-git-checks --provenance`

両ジョブとも直前に `# pnpm publish は CI では正常に動作しない` のコメントが残っている (`:74`, `:100`)。`--no-git-checks` は `pnpm publish` の現役オプションでもあり、過去に `pnpm publish` 経路で書かれていた時代のフラグが `npm publish` に切り替わった際に残置された可能性がある (実装着手時に `git blame` で経緯を確認する)。

npm 11 の publish docs (<https://docs.npmjs.com/cli/v11/commands/npm-publish>) には `--no-git-checks` の記載がなく、publish 実行時に `npm warn Unknown cli config "--git-checks"` が出ている。歴史的には npm 10 系の publish に `git-checks` config が存在したが、npm 11 での扱いと npm 12 での挙動は実機検証が必要 (事前調査 Step 1 参照)。

publish ジョブの working directory は完全に clean ではない可能性がある: `build` ジョブで生成した `dist/` を `actions/download-artifact` で展開しているため、`.gitignore` で `dist/` がカバーされていない場合は git status に untracked として現れる。`--no-git-checks` を外した際に `dist/` の untracked 状態が npm publish の git checks に引っかからないか、Step 1 の調査で確認する必要がある。

## 事前調査

実装着手時に以下を順に実施し、結果を「解決方法」の実績欄に記録する:

### Step 1: `--no-git-checks` の現状動作と削除影響の確認

- `git blame .github/workflows/npm-publish.yml` で `--no-git-checks` が追加された経緯を確認する (`pnpm publish` 時代の名残かどうか)
- `.gitignore` で `dist/` がカバーされているか確認する
- ローカルで `npm publish --dry-run` を実行し、`--no-git-checks` ありとなしの差分を確認する
  - `dist/` を生成した状態 (`pnpm run build` 後) と未生成の状態の両方で実行する
  - git working directory が clean な状態とそうでない状態の両方で実行する
  - npm 11 が何らかの git checks で fail するか確認する
- 結果として「単純削除可能」(case A) と「代替手段必要」(case B) のどちらに該当するか判定する

### Step 2: case B 時の代替手段検証

case A で完結する場合は Step 2 をスキップする。case B (削除すると publish が止まる) の場合のみ以下を検証する:

- workflow step の `env:` に `NPM_CONFIG_GIT_CHECKS: "false"` を追加する案 (CI スコープに閉じ、影響範囲が小さい第一候補)
- リポジトリ root の `.npmrc` に `git-checks=false` を書く案 (ローカル開発者の `npm install` 等にも影響する副次候補)
- いずれの案も npm 11 でフラグの `Unknown cli config` 警告が出ないことを確認する (`NPM_CONFIG_GIT_CHECKS` 経路も同じ unknown 扱いになる可能性があるため要検証)

## 設計方針

事前調査の結果に応じて分岐する:

- **case A (`--no-git-checks` を単純削除可能)**: publish 2 経路 (もしくは 0057 ジョブ統合後は 1 経路) から `--no-git-checks` を削除する
- **case B (代替手段必要)**: `--no-git-checks` を削除し、Step 2 で動作確認できた代替手段 (推奨は `env: NPM_CONFIG_GIT_CHECKS: "false"`) に置換する

いずれの場合も、`# pnpm publish は CI では正常に動作しない` のコメント (`:74`, `:100`) は 0055 (workflow コメント整理) のスコープのため触らない。

## 変更対象ファイル

| ファイル                            | 内容                                                                                                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/npm-publish.yml` | publish 2 経路 (`npm-publish-canary` の `npm publish ... --tag canary --provenance`、`npm-publish` の `npm publish ... --provenance`) から `--no-git-checks` を削除 (case B 採用時は `env:` に `NPM_CONFIG_GIT_CHECKS: "false"` を追加) |
| `CHANGES.md`                        | `## develop` の `### misc` 内の `[FIX]` 群末尾に 1 エントリ追記                                                                                                                                                                         |

行番号 `:77` / `:103` は 2026-06-16 時点の値。0055 / 0056 / 0057 のマージ後はずれるため、実装着手時はジョブ名 (`npm-publish-canary` / `npm-publish`) と `npm publish --no-git-checks ... --provenance` 行を grep で再特定する。

## 完了条件

- publish 2 経路 (0057 ジョブ統合後は 1 経路) で:
  - case A の場合: `--no-git-checks` が削除されている
  - case B の場合: `--no-git-checks` が削除され、`NPM_CONFIG_GIT_CHECKS=false` 環境変数または `.npmrc` の `git-checks=false` に置換されている
- いずれの場合も次回 publish ログに `npm warn Unknown cli config "--git-checks"` warning が出なくなる
- `.github/workflows/npm-publish.yml` 以外への変更が無いこと (CHANGES.md は除く)
- `CHANGES.md` `## develop` の `### misc` 内の `[FIX]` 群末尾に次を追記する (2026-06-16 時点では `:98` の `- @voluntas` (`### misc` の `[FIX]` 群末尾エントリの担当者行) の直後、空行の直前。他 issue のマージで行番号が変動するため、マージ時点では「`### misc` の `[FIX]` 群末尾」という相対位置で判断する):

  ```
  - [FIX] `.github/workflows/npm-publish.yml` から `--no-git-checks` フラグを削除する
    - npm 11 で `npm warn Unknown cli config "--git-checks". This will stop working in the next major version of npm.` warning が出ており、npm v12 で publish が break する前に対処する
    - @voluntas
  ```

- 動作確認は本 PR では実施しない (publish workflow は tag push でのみ起動するため)。マージ後フォローアップで確認する

## マージ後フォローアップ

マージ後の次回 publish タイミング (canary tag push) で以下をリリース実施者 (@voluntas) が確認する:

- canary publish ログに `npm warn Unknown cli config "--git-checks"` warning が出ないこと
- canary publish 自体が成功し、npm レジストリに canary バージョンが publish されていること
- 続く latest tag push でも同様に warning なしで publish が成功すること

publish が失敗した場合の復旧手順 (0033 と同等):

- 失敗した tag を削除する (`git tag -d <tag>` および `git push --delete origin <tag>`)
- 修正 (case A → case B 切り替え等) を別 PR で投入する
- version bump して再 push する

## スコープ外

- `.github/workflows/npm-publish.yml` のコメント整理 — 0055 で扱う
- `npm install -g npm@latest` ステップの重複共通化 — 0056 で扱う
- canary / latest publish ジョブ統合 — 0057 で扱う
- `actions/setup-node` から `setup-vp` への置換 — 0039 で扱う
- `package.json` の `publishConfig` 設定 — 0033 で決着済、本 issue では触らない
- `slack-notify` ジョブの編集 — 0023 (closed) で決着済、本 issue では触らない

## マージ順

- 上流依存: なし (本 issue は publish 行から 1 フラグを削除するのみで他 issue と独立)
- 0055 / 0056 / 0057 とは同じ workflow を触るため衝突可能性あり:
  - 0057 (ジョブ統合) → 0058 (本 issue) の順なら 1 経路のみ修正で済む (理想)
  - 0058 → 0057 の順なら 2 経路を修正し、0057 統合時に再確認
  - 0055 / 0056 とは触る行が異なり競合は限定的
- 2026.1.0 リリース (issue 0059) の Low ブロッカー候補

## 関連 issue

- 0033 (closed): スコープ外セクション「`--no-git-checks` 削除 issue (未起票)」で本 issue 起票を予告
- 0055 (open): workflow コメント整理 (`# pnpm publish は CI では正常に動作しない` のコメント整理)
- 0056 (open): `npm install -g npm@latest` 重複共通化
- 0057 (open): canary / latest publish ジョブ統合
- 0039 (open): `actions/setup-node` を `voidzero-dev/setup-vp` に置換
- 0059 (open): 2026.1.0 リリース、本 issue は Low ブロッカー候補

## 解決方法

実装手順 (実装完了後に「実績」セクションを追記):

1. 上記「事前調査」 Step 1 を実施し、case A / case B を判定する
2. case B の場合は Step 2 で代替手段を確定する
3. 設計方針に従い `.github/workflows/npm-publish.yml` を修正する
4. workflow ファイルの YAML 構文を `yamllint` 等で確認する
5. `CHANGES.md` に上記 `[FIX]` エントリを追記する
6. PR 作成・レビュー・squash merge する
7. マージ後フォローアップ (上記セクション) を次回 publish タイミングでリリース実施者が確認する

実績:

- 事前調査 Step 1 を実施した。
  - `git blame .github/workflows/npm-publish.yml` で経緯確認: `7ec64660` (2025-05-05) の workflow 新規作成時から `--no-git-checks` が付いていた。同 commit のコメントに `# pnpm publish は CI では正常に動作しない / https://github.com/pnpm/pnpm/issues/4937` とあり、元々 `pnpm publish` 用の現役フラグが `npm publish` に切り替わった際に残置された格好。
  - `.gitignore` に `dist/` が含まれていることを確認 (`.npmignore` は無く、`package.json` の `files: ["dist"]` で制御)。
  - ローカルで `npm publish --dry-run --tag canary` を `--no-git-checks` ありとなしの両方で実行: あり = `npm warn Unknown cli config "--git-checks". This will stop working in the next major version of npm.` warning、なし = warning 無しで正常完了。`npm config get git-checks` は `undefined` で npm 11 にはこの config 項目自体が存在しない。
  - 判定: case A (単純削除可能)。
- `.github/workflows/npm-publish.yml:77` の `npm publish --no-git-checks --tag canary --provenance` から `--no-git-checks` を削除した。
- `.github/workflows/npm-publish.yml:103` の `npm publish --no-git-checks --provenance` から `--no-git-checks` を削除した。
- `grep -n "no-git-checks\|git-checks" .github/workflows/npm-publish.yml` の結果が 0 件であることを確認した。
- `# pnpm publish は CI では正常に動作しない` のコメント (`:74`, `:100`) は 0055 のスコープのため触っていない。
- `CHANGES.md` の `## develop` 配下、`### misc` 内 `[FIX]` 群末尾 (`e2e-tests の fake media 生成に明示的 cleanup()...` エントリの直後、`## 2025.2.0` の直前) に `[FIX]` エントリ 1 件を追加した。
- `pnpm fmt` 後の追加差分なしを確認した。
- 動作確認 (本 PR では実施しない): publish workflow は tag push でのみ起動するため、マージ後フォローアップで次回 canary tag push 時に warning 消失と publish 成功を確認する。
