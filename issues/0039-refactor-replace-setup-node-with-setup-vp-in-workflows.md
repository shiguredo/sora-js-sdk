# GitHub Actions の actions/setup-node を voidzero-dev/setup-vp に置き換える

- Priority: Low
- Created: 2026-06-08
- Completed: {YYYY-MM-DD}
- Model: Sonnet 4.6
- Branch: feature/refactor-replace-setup-node-with-setup-vp-in-workflows
- Polished: 2026-06-16

## 目的

`.github/workflows/` 配下の各ワークフローで `actions/setup-node` を `voidzero-dev/setup-vp` に置き換え、Node セットアップ手段を `sora-devtools` と揃える。あわせて pnpm 経由のコマンドのうち `vp` サブコマンドで代替可能なもの (`pnpm install --frozen-lockfile` / `pnpm run build` / `pnpm run lint` / `pnpm run typecheck` / `pnpm exec playwright` / `pnpm exec tsgo` / `pnpm run test`) を `vp` 経由に書き換える。matrix で `package.json` を一時的に差し替える `pnpm add` / `pnpm remove` は本 issue のスコープ外として pnpm 直呼び出しのまま維持し、`pnpm/action-setup` も触らない。

## 優先度根拠

機能・バグ影響はない workflow リファクタ。`sora-devtools` 側は `voidzero-dev/setup-vp` への統一済みで、action SHA 更新の作業を両リポジトリで同期できる利点がある。緊急性はないため Low。

## 現状

`actions/setup-node` を使うジョブを全列挙する。`dependency-review.yml` と各 workflow 末尾の `slack_notify` ジョブは Node を使わないため対象外。`actions/setup-node` の出現は `grep -rn 'actions/setup-node' .github/workflows/` で 11 件 (= 11 ジョブ × 1 行ずつ)。

| ファイル                                 | ジョブ                      | 主なコマンド                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yaml`              | `ci`                        | `pnpm install --frozen-lockfile`, `pnpm add -E -D typescript@${{ matrix.typescript }} -w`, `pnpm run build`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test` (Node 3 × TypeScript 12 = 36 ジョブ)                                                                                                              |
| `.github/workflows/ci.yaml`              | `typescript-native-preview` | `pnpm install --frozen-lockfile`, `pnpm remove -D typescript -w`, `pnpm add -E -D @typescript/native-preview@${{ matrix.version }} -w`, `pnpm exec tsgo --emitDeclarationOnly -p tsconfig.json`, `pnpm exec tsgo --noEmit -p e2e-tests/tsconfig.json` (Node 26 固定 × version `latest` / `beta` = 2 ジョブ)           |
| `.github/workflows/e2e-test.yml`         | `e2e-test`                  | `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm exec playwright install ${{ matrix.browser.type }} --with-deps`, `pnpm exec playwright test --project="${{ matrix.browser.name }}"` (Node 3 × OS 3 × Browser 3 = 27 ジョブ)                                                                                 |
| `.github/workflows/e2e-test-canary.yml`  | `e2e-test-canary`           | `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm exec playwright test --project="${{ matrix.browser.name }}"` (Node 22 固定 × Browser 2 = 2 ジョブ、macos-15)                                                                                                                                                |
| `.github/workflows/e2e-test-h265.yml`    | `e2e-test-h265`             | `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm exec playwright test --project="${{ matrix.browser.name }}" e2e-tests/tests/h265.test.ts` (Node 22 固定 × Browser 4 = 4 ジョブ、self-hosted macOS)                                                                                                          |
| `.github/workflows/e2e-test-webkit.yml`  | `e2e-test-webkit`           | `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm exec playwright install webkit --with-deps`, `pnpm exec playwright test --project="WebKit" e2e-tests/tests/webkit.test.ts` (Node 22 固定 = 1 ジョブ、self-hosted macOS)                                                                                     |
| `.github/workflows/npm-publish.yml`      | `verify-version`            | `node -p "require('./package.json').version"` (pnpm 不使用、Node 22 固定)                                                                                                                                                                                                                                             |
| `.github/workflows/npm-publish.yml`      | `build`                     | `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm run lint`, `pnpm run typecheck`, `actions/upload-artifact` (Node 22 固定)                                                                                                                                                                                   |
| `.github/workflows/npm-publish.yml`      | `npm-publish-canary`        | `with: registry-url: https://registry.npmjs.org`, `actions/download-artifact`, `npm install -g npm@latest`, `npm publish --no-git-checks --tag canary --provenance` (pnpm 不使用、Node 22 固定)                                                                                                                       |
| `.github/workflows/npm-publish.yml`      | `npm-publish`               | `with: registry-url: https://registry.npmjs.org`, `actions/download-artifact`, `npm install -g npm@latest`, `npm publish --no-git-checks --provenance` (pnpm 不使用、Node 22 固定)                                                                                                                                    |
| `.github/workflows/npm-pkg-e2e-test.yml` | `npm-pkg-e2e-test`          | `pnpm install --frozen-lockfile`, `pnpm add -E sora-js-sdk@${{ matrix.sdk_version }}` (`working-directory: ./e2e-tests`), `pnpm exec playwright install ${{ matrix.browser.type }} --with-deps`, `pnpm exec playwright test --project="${{ matrix.browser.name }}"` (Node 2 × Browser 2 × sdk_version 11 = 44 ジョブ) |

`e2e-test-h265.yml:57-58` の `playwright test` 行は `- run:` の値を改行 + インデントで複数行 plain scalar として書いており、置換時もこの書式を保つ (`e2e-test-webkit.yml:45` は単一行)。

## 設計方針

### action の置き換え

- `actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0` を `voidzero-dev/setup-vp@ca1c46663915d6c1042ae23bd39ab85718bfb0fa # v1.10.0` に置き換える。`sora-devtools` の現在 SHA と完全一致させ、両リポジトリの追従を 1 度の確認で済ませる運用に揃える (本 issue 起票時点で `voidzero-dev/setup-vp` の最新は v1.12.0 だが、バージョン追従はスコープ外)。
- `with:` パラメータは現状の値を保ったまま渡す。具体的には:
  - `node-version`: matrix `${{ matrix.node }}` / 引用符付き文字列リテラル `"26"` / 引用符なし数値リテラル `22` の 3 形態がある。どの形態でも `voidzero-dev/setup-vp` がそのまま受けるかを「## 着手前確認」で確認する。
  - `registry-url: https://registry.npmjs.org` (`npm-publish-canary` / `npm-publish` ジョブ): `voidzero-dev/setup-vp` の `registry-url` 入力に同じ値を渡す。`actions/setup-node` と同じく `~/.npmrc` に `registry=` を書き込む挙動を「## 着手前確認」で確認する。
  - `cache` / `run-install` / `node-version-file` は追加しない (キャッシュ / install 戦略は別 issue 扱い)。

### pnpm/action-setup の扱い

matrix で `package.json` を一時的に書き換える pnpm 直呼び出しが残るため、現状の `pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093 # v6.0.8` をすべての既存ジョブで触らない (追加・削除しない)。`vp install` が生成する pnpm シムだけに依存することの未検証リスクを避け、`pnpm/action-setup` が無いジョブには元から無いまま、有るジョブには元から有るまま維持する。

### コマンド対応表

`package.json` の scripts (`"build": "vp build"`, `"lint": "vp lint --type-aware"`, `"typecheck": "tsc --noEmit"`, `"test": "vp test run"`) の中身を workflow に展開する形で書き換える。`pnpm run X` から `vp run X` への一律機械置換は採用しない (`vp run` 経路の挙動が `voidzero-dev/setup-vp` 環境で未検証のため)。`sora-devtools` が採用する `vp check` (lint + fmt + type-check 統合) も本 issue では採用しない (本リポジトリの `lint` / `typecheck` を独立 step に保つ運用を本 issue で変えない。`vp check` への統合は別 issue で扱う)。

| 変更前                           | 変更後                         | 補足                                                                                                                                                                                   |
| -------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | `vp install --frozen-lockfile` | `--frozen-lockfile` を明示し pnpm install と同じく lockfile drift をエラー終了させる挙動を維持する                                                                                     |
| `pnpm run build`                 | `vp build`                     | scripts の中身と完全一致                                                                                                                                                               |
| `pnpm run lint`                  | `vp lint --type-aware`         | scripts の中身と完全一致。`--type-aware` を落とすと型情報を使う lint ルールが無効化されるため必ず付ける                                                                                |
| `pnpm run typecheck`             | `vp exec tsc --noEmit`         | scripts の中身と同じ tsc 直叩きを `vp exec` 経由で行う。`vp typecheck` サブコマンドは `vite-plus` 0.1.24 では未提供のため使わない。`vp exec` は `node_modules/.bin/tsc` を解決する前提 |
| `pnpm run test`                  | `vp test run`                  | scripts の中身と完全一致                                                                                                                                                               |
| `pnpm exec playwright <args>`    | `vp exec playwright <args>`    | 引数 (`install <browser> --with-deps`、`test --project="..." <file>`) はそのまま透過する                                                                                               |
| `pnpm exec tsgo <args>`          | `vp exec tsgo <args>`          | `typescript-native-preview` ジョブの 2 行のみ                                                                                                                                          |

`sora-devtools` 側の動作実績は `vp install --frozen-lockfile` が `sora-devtools/.github/workflows/deploy-r2.yml:22` の 1 ヶ所のみ、`vp exec playwright install` / `vp exec playwright test` が `sora-devtools/.github/workflows/e2e-test.yml:33-34` (いずれも ubuntu-24.04)。`vp lint --type-aware` / `vp exec tsc --noEmit` / `vp exec tsgo`、および Windows runner / macOS runner (`macos-15` / self-hosted macOS) での `voidzero-dev/setup-vp` 全般の動作は `sora-devtools` に実績がなく、本 issue の PR で初回検証する。

## 着手前確認

実装着手前に以下を確認する。1 / 2 のいずれかに支障がある場合は本 issue を保留してユーザーに相談する。

1. `voidzero-dev/setup-vp@v1.10.0` の `action.yml` / README で以下の入力サポートを確認する。
   - `node-version`: matrix `${{ matrix.node }}` / 引用符付き文字列リテラル / 引用符なし数値リテラル をすべて受け付けるか。
   - `registry-url`: `https://registry.npmjs.org` を渡したときに `~/.npmrc` に `registry=https://registry.npmjs.org` を書き込むか (本リポジトリは OIDC publish で `NODE_AUTH_TOKEN` を使わないため `~/.npmrc` の registry 設定のみで足りる)。
2. self-hosted runner (`e2e-test-h265.yml` / `e2e-test-webkit.yml` の `runs-on: { group: Self, labels: [self-hosted, macOS, ARM64, Apple-M2-Pro] }`) で `voidzero-dev/setup-vp` の動作経路 (vp バイナリ取得・Node セットアップ) が許可されているかをネットワーク管理者と確認する。許可されない場合は self-hosted を使う 2 ファイルを別 PR に分離する。
3. `sora-devtools` 側の `voidzero-dev/setup-vp` SHA がまだ `ca1c46663915d6c1042ae23bd39ab85718bfb0fa # v1.10.0` のままであることを確認する。既に更新されていたら本 issue の SHA をその値に合わせるか、`sora-devtools` 側の追従を別 issue で先行させるかを判断する。

## 解決方法

### ステップ 1: 全 workflow の actions/setup-node を voidzero-dev/setup-vp に置換 + コマンド書き換え

「現状」表の 11 ジョブそれぞれで以下を実施する。代表例として `ci.yaml` の `ci` ジョブの場合 (`actions/checkout` 行は省略):

変更前 (`ci.yaml:37-46`):

```yaml
- uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
  with:
    node-version: ${{ matrix.node }}
- uses: pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093 # v6.0.8
- run: pnpm install --frozen-lockfile
- run: pnpm add -E -D typescript@${{ matrix.typescript }} -w
- run: pnpm run build
- run: pnpm run lint
- run: pnpm run typecheck
- run: pnpm run test
```

変更後:

```yaml
- uses: voidzero-dev/setup-vp@ca1c46663915d6c1042ae23bd39ab85718bfb0fa # v1.10.0
  with:
    node-version: ${{ matrix.node }}
- uses: pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093 # v6.0.8
- run: vp install --frozen-lockfile
- run: pnpm add -E -D typescript@${{ matrix.typescript }} -w
- run: vp build
- run: vp lint --type-aware
- run: vp exec tsc --noEmit
- run: vp test run
```

他ジョブも同じ要領で置換する。各ジョブ特有の取り扱い:

- `ci.yaml` の `typescript-native-preview` ジョブ (`ci.yaml:48-71`): `pnpm exec tsgo --emitDeclarationOnly -p tsconfig.json` (line 64) と `pnpm exec tsgo --noEmit -p e2e-tests/tsconfig.json` (line 70) を `vp exec tsgo ...` に置換。line 65-69 の YAML コメント (`# e2e-tests/tsconfig.json の型チェックは現状...` 5 行) と line 71 の `continue-on-error: true` は変更せず保持する。
- `e2e-test-h265.yml:57-58` の `playwright test` 行は `- run:` の値が改行 + インデントで複数行に分かれている (YAML plain scalar の改行畳み込み)。`vp exec playwright test ...` に置換する際も同じ書式を保ち、引数 `e2e-tests/tests/h265.test.ts` を落とさない。`e2e-test-webkit.yml:45` は単一行のため、`pnpm exec playwright test ...` を `vp exec playwright test ...` に置換するだけ。
- `npm-publish.yml` の `npm-publish-canary` (`:63-66`) / `npm-publish` (`:89-92`) ジョブ: `with:` の `node-version: 22` と `registry-url: https://registry.npmjs.org` を `voidzero-dev/setup-vp` の `with:` にそのまま入れる。
- `npm-pkg-e2e-test.yml:72`: `pnpm install --frozen-lockfile` を `vp install --frozen-lockfile` に置換する (対応表通り)。直後の `pnpm add -E sora-js-sdk@${{ matrix.sdk_version }}` (`:73-74`) は維持する。

### ステップ 2: CHANGES.md への追記

`CHANGES.md` の `## develop` 直下にある既存 `### misc` の `[CHANGE]` 群末尾 (現状の最後の `[CHANGE]` 行の次) に以下を追加する。種別順 `[CHANGE] → [ADD] → [UPDATE] → [FIX]` を維持する。

```markdown
- [CHANGE] GitHub Actions workflow の Node セットアップを `actions/setup-node` から `voidzero-dev/setup-vp` に置き換え、pnpm 経由のコマンドを `vp` 経由に統一する
  - @voluntas
```

## 完了条件

- `grep -rn 'actions/setup-node' .github/workflows/` の結果が 0 件。
- `grep -rn 'voidzero-dev/setup-vp' .github/workflows/` の結果が「現状」表に列挙した 11 ジョブ分の 11 行と一致する。
- `grep -rnE 'pnpm install( |$)' .github/workflows/` / `grep -rnE 'pnpm run( |$)' .github/workflows/` / `grep -rnE 'pnpm exec( |$)' .github/workflows/` の結果がそれぞれ 0 件。
- `grep -rn 'pnpm ' .github/workflows/` の結果に残るのは (a) `pnpm/action-setup` 行、(b) `pnpm add` / `pnpm remove` 行、(c) `# pnpm publish は CI では正常に動作しない` 等のコメント行のみで、それ以外の `pnpm` 直呼び出しが無いことを目視確認する。
- `npm-publish-canary` / `npm-publish` ジョブに一時的に `- run: cat ~/.npmrc` ステップを追加して PR の CI ログで `registry=https://registry.npmjs.org` の書き込みを確認し、PR マージ前に該当ステップを削除する。
- `ci.yaml` の `ci` (Node 3 × TypeScript 12 = 36 ジョブ) と `typescript-native-preview` (Node 26 固定 × version 2 = 2 ジョブ) が PR の CI ですべて成功する。
- `e2e-test.yml` (ubuntu-24.04 / macos-15 / windows-2025-vs2026 × Chromium / Chrome / Chrome Beta × Node 3 = 27 ジョブ) が PR の CI ですべて成功する。
- self-hosted runner の `e2e-test-h265.yml` / `e2e-test-webkit.yml` を `workflow_dispatch` で起動して成功する。
- `e2e-test-canary.yml` と `npm-pkg-e2e-test.yml` を PR ブランチ push で成功させる。
- `CHANGES.md` の `### misc` 内 `[CHANGE]` 群末尾に追加エントリが入っている。

`npm-publish.yml` の 4 ジョブ (`verify-version` / `build` / `npm-publish-canary` / `npm-publish`) はいずれも tag push でしか走らないため、本 PR の CI では完全には確認できない。次回 canary tag push でのフォローアップ確認とする。

## スコープ外

- `pnpm add` / `pnpm remove` の `vp` 化 (`vite-plus` 側に matrix 差し替え対応が入った段階で別 issue)。
- `npm-publish.yml` の `npm install -g npm@latest` / `npm publish` の `vp` / `pnpm` 化 (0033 の経緯から npm のまま維持)。
- `vp check` への lint / typecheck / fmt 統合 (本 issue では独立 step を維持。統合は別 issue)。
- ライブラリビルドを `vp pack` に切り替え (0051)、`node-version` の引き上げ (0052)、`npm-publish.yml` のリファクタ群 (0055-0058)。
- `voidzero-dev/setup-vp` のバージョン追従 (v1.10.0 → v1.12.0 等の追従は `sora-devtools` 側の更新と合わせて別 issue)。

## 関連 issue

- 0033 (closed): `npm publish --provenance` を追加。`actions/setup-node` から `setup-vp` への置換は本 issue で扱うとスコープ外セクションで予告された。
- 0051 (open): ライブラリビルドを `vp build` から `vp pack` に切り替える。本 issue 着手時に 0051 がマージ済みなら `package.json` の `build` script が `vp pack` になっているため、workflow にも `vp build` ではなく `vp pack` を直書きする。本 issue → 0051 の順を推奨。
- 0052 (open): `engines.node` を `22.18.0` 以上に引き上げる。本 issue 着手時に 0052 がマージ済みなら workflow の `node-version` 値が `"22.18.0"` 等に変わっているので、その値を保ったまま `voidzero-dev/setup-vp` に渡す。
- 0055-0058 (open): `npm-publish.yml` のリファクタ群 (コメント整理 / `npm install -g npm@latest` 重複共通化 / publish 2 ジョブ統合 / `--no-git-checks` 削除)。本 issue 着手時にいずれかがマージ済みなら publish ジョブ構造が変わっている可能性があるため、その時点での `npm-publish.yml` を再確認してから置換する。
