# ci の typescript@next が vite-plus の dts 生成と非互換で ci 全体が fail 表示になる

- Priority: High
- Created: 2026-09-10
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/fix-ci-typescript-next-build-failure
- Polished: {YYYY-MM-DD}

## 目的

`.github/workflows/ci.yaml` の `ci` ジョブは typescript の各バージョン (`next` / `beta` / `7.0` 〜 `5.1`) でビルド・lint・型チェック・テストを検証しているが、`typescript@next` が `vite-plus` の dts 生成と非互換になり `ci (…, next)` が failure する。`strategy.fail-fast` が既定 true のため最初の失敗で残りのジョブが cancelled になり、GitHub の checks では `ci` 全体が fail と表示される。安定版の合否が確認できず、すべての PR のマージ判断を誤らせるため解消する。

## 優先度根拠

High。2026-09-05 以降の ci は `typescript@next` の失敗で安定版ジョブも cancelled になり `ci` が pass しないため、SDK 変更と無関係に PR をマージできない。CI を信頼できる状態へ戻すことを最優先にする。

## 現状

### ci の構成

- `.github/workflows/ci.yaml` の `ci` ジョブは `node` 3 種 × `typescript` 13 種の合計 39 ジョブを持つ。
- 各ジョブは `vp install --frozen-lockfile` の後 `vp add -E -D typescript@${{ matrix.typescript }} -w` で対象バージョンを導入し、`vp run build` → `vp lint --type-aware` → `vp exec tsc --noEmit` → `vp test run` を実行する。
- `strategy.fail-fast` は未設定 (GitHub Actions の既定値 true)。

### 失敗内容

`typescript@next` は現在 `7.1.0-dev.20260902.1` で、`vp run build` の `rolldown-plugin-dts` が次の例外で失敗する。

```
[plugin rolldown-plugin-dts:generate]
TypeError: Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')
  at @voidzero-dev/vite-plus-core@0.2.8/dist/tsdown/tsc-...js
```

`vite-plus` 0.2.8 の dts 生成が `typescript.sys.useCaseSensitiveFileNames` を読む前提になっており、TS 7.1 dev 側で `sys` の形が変わったことで undefined 参照になっている。`typescript@beta` は現状 pass しており、安定版 (`7.0` 〜 `5.1`) は fail-fast による cancelled で合否不明のままである。

### 根拠

- 本リポジトリの PR の run 34434175753: `ci (26, next)` のみ failure、残り 38 ジョブは cancelled、`typescript-native-preview` は pass。
- 別ブランチの run 34074350480 (2026-09-07、`feature/test-zztkm-add-stereo-audio-test-pattern`): `ci (24, next)` が同じ `useCaseSensitiveFileNames` で failure。node 24 でも再現するため node バージョンは無関係。
- `vite-plus` 0.3.0 への更新 PR の run 33977172808 でも `ci (24, next)` が同じ例外で failure。`vite-plus` のバージョン更新だけでは解消しない。

## 設計方針

`typescript@next` は日次で更新され、`vite-plus` が追随するまで SDK 側では修正できない。`next` の失敗が安定版ジョブを巻き込まないようにすることを優先する。

1. `ci` ジョブに `strategy.fail-fast: false` を設定し、1 ジョブの失敗で他ジョブが cancelled にならないようにする。これにより安定版 (`beta` / `7.0` 〜 `5.1`) の合否が checks に表示される。
2. `typescript@next` のジョブを非ブロッキングにする。`continue-on-error: ${{ matrix.typescript == 'next' }}` を設定する方法を第一候補とする (既存の `typescript-native-preview` が e2e の型チェックに `continue-on-error` を使っているのと同じ扱い)。job レベルの `continue-on-error` で required check を満たせない場合は、`typescript@next` を matrix から一旦外す。
3. `beta` は pass しているため対象外とする。`vite-plus` が TS 7.1 dev に対応したら `typescript@next` を通常の blocking 対象に戻す。

実装イメージ (`ci` ジョブの抜粋):

```yaml
ci:
  runs-on: ubuntu-slim
  strategy:
    fail-fast: false
    matrix:
      node:
        - "26"
        # ...
      typescript:
        - "next"
        # ...
  # typescript@next は日次更新で vite-plus 側が追随するまで失敗しうるため非ブロッキングにする
  continue-on-error: ${{ matrix.typescript == 'next' }}
  steps:
    # ...
```

## スコープ外

- `vite-plus` 自体の更新 (dependabot の `vite-plus 0.3.0` PR で別途扱う)
- `typescript-native-preview` ジョブの既存 `continue-on-error` (e2e tsconfig) の見直し
- 今回の SDK 変更 (issue 0068) の内容

## 完了条件

- `typescript@next` の失敗で `ci` 全体が fail 表示にならない
- `fail-fast` による cancelled が解消され、安定版 (`beta` / `7.0` 〜 `5.1`) の合否が checks で確認できる
- `ci` が PR の required check として pass する
- ワークフローのみの変更であり、ローカルの `vp check` / `vp test run` の結果を変えない
- 保留中の PR (0068) を再実行し、`ci` が pass することを確認してからマージする

## 解決方法

実装完了後に追記する (どのファイルをどう変更したかの実績)。
