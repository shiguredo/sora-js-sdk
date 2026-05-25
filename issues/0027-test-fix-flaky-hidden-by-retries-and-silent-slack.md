# Playwright の `retries: 3` で flaky テストが CI 上で隠蔽される

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-flaky-detection

> **ファイル名について**: `silent-slack` は issue 0023 (closed) 以前の誤前提を反映している。Slack 不通知の主因は slack-notify ではなく **job が retry 吸収後も success のまま** である (issue 0023 参照)。close 時に `0027-test-fix-flaky-hidden-by-retries.md` へリネームしてよい (必須ではない)。

## 必要性

**必要。** `playwright.config.ts:8` の `retries: 3` により E2E が最大 4 回実行され、1 回でも通れば job が success になる。flaky が CI 上で表面化せず develop が更新され、タグ push → npm publish で壊れた SDK が npm に出る経路が成立する。Slack (`notify_mode: failure_and_fixed`) も job が green なら通知しない — これは slack-notify の不具合ではない (issue 0023)。

## 目的

CI 環境のみ `retries` を `1` に下げ、Playwright JSON reporter の `stats.flaky` で flaky 検出時に job を fail させる。

## 優先度根拠

High。リリース判定の根拠そのものが崩れうる。flaky 吸収は develop マージと npm publish の信頼性を直接損なう。

## 現状

`playwright.config.ts:5-12`

```ts
export default defineConfig({
  testDir: "e2e-tests/tests",
  // 本来は flaky テストをなくすべきだが、一時的に対応
  retries: 3,
  workers: 1,
  // fullyParallel: true,
  reporter: "list",
```

- CI でも `retries: 3` が有効
- `reporter: "list"` のみで flaky 件数を機械可読に取得できない

## 設計方針

### playwright.config.ts

```ts
export default defineConfig({
  testDir: "e2e-tests/tests",
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // fullyParallel: true,
  reporter: process.env.CI
    ? [["list"], ["json", { outputFile: "playwright-report.json" }]]
    : "list",
```

- ローカル: `retries: 0`, list reporter のみ
- CI: `retries: 1` (最大 2 回実行)、list + JSON reporter

### E2E workflow 5 本

各 workflow の `pnpm exec playwright test` step **直後** に flaky 検出 step を追加する。matrix job 内の同一 `steps` ブロックに置く。

```yaml
- name: Detect flaky tests
  if: always()
  shell: bash
  run: |
    if [ ! -f playwright-report.json ]; then
      echo "playwright-report.json not found"
      exit 1
    fi
    FLAKY=$(jq -r '.stats.flaky // 0' playwright-report.json)
    echo "Flaky tests: ${FLAKY}"
    if [ "$FLAKY" -gt 0 ]; then
      echo "Failing job because flaky tests detected"
      exit 1
    fi
```

Playwright JSON reporter (v1.x, 本 repo は `@playwright/test@1.59.1`) はトップレベル `stats.flaky` に件数を集計する。`.status == "flaky"` の再帰探索は使わない。

対象 workflow と `playwright test` step 位置 (着手時):

| workflow                                 | step 行 (着手時) |
| ---------------------------------------- | ---------------- |
| `.github/workflows/e2e-test.yml`         | 71-74            |
| `.github/workflows/e2e-test-canary.yml`  | 57-59            |
| `.github/workflows/e2e-test-h265.yml`    | 54-55 付近       |
| `.github/workflows/e2e-test-webkit.yml`  | 42 付近          |
| `.github/workflows/npm-pkg-e2e-test.yml` | 74-76            |

flaky 検出 step が fail すれば job が failure になり、slack-notify (`status: ${{ job.status }}` + action 内 `gh api` による failure 自動検出) で Slack 通知される。

## 完了条件

### コード変更

- [ ] `playwright.config.ts` を上記設計どおり変更する
- [ ] E2E workflow 5 本すべてに `Detect flaky tests` step を追加する
- [ ] `waitForTimeout(...)` の置き換えは行わない (issue 0032)

### 検証

- [ ] `pnpm test` が通る (SDK 単体テスト。playwright.config 変更の影響なし)
- [ ] ローカル: `pnpm exec playwright test --project="Chromium" e2e-tests/tests/stereo_audio.test.ts` が `retries: 0` で動作すること
- [ ] ローカル dry-run (任意): `CI=true pnpm exec playwright test --project="Chromium" e2e-tests/tests/stereo_audio.test.ts` 実行後、`playwright-report.json` が生成され `jq -r '.stats.flaky // 0'` が 0 であること
- [ ] CI: PR マージ後、e2e 系 workflow が green であること
- [ ] flaky 検出の動作確認: 意図的に flaky になるテストを一時追加して CI で job が fail することを確認した後、テストを revert する (または PR レビューで step ロジックを確認)

### 変更履歴

- [ ] `CHANGES.md` `## develop` の `### misc` に追記する

  ```
  - [FIX] Playwright の retries を CI のみ 1 に下げ、JSON reporter の stats.flaky で flaky を検出して CI で fail させるようにする
    - @voluntas
  ```

## スコープ外

- `waitForTimeout(...)` → 決定的待機への置き換え (issue 0032)
- slack-notify の `status` 変更 (issue 0023 で不要)
- workflow `permissions` (issue 0026)
- flaky 根本原因の個別テスト修正 (0032 以降)

## マージ順

**0026 の後、0028 / 0029 の前。** 0024–0026 (CI 基盤) → **0027** (flaky 検出) → 0028 / 0029 (E2E 品質) を推奨する。0027 単体は 0026 と workflow を共有するが、コンフリクトは step 追加のみで解消可能。
