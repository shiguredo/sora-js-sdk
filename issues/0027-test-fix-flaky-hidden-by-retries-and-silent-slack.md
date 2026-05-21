# `retries: 3` と Slack 通知不発（issue 0023）の組み合わせで flaky を完全に隠蔽している

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-flaky-detection

## 目的

`playwright.config.ts:7-8` の `retries: 3` で失敗を 4 回まで再試行し、偶然 1 回通れば success とする運用が常態化している。issue 0023 の Slack 通知不発と組み合わさり、flaky テストが完全に隠蔽されたままタグ push → npm publish という流れで壊れた SDK が npm latest に出る経路を塞ぐ。

## 優先度根拠

High。リリース判定の信頼性そのものが崩壊している。本番に近い回帰バグが develop で繰り返し起きていても気付けない。

## 現状

`playwright.config.ts:5-9`

```ts
export default defineConfig({
  testDir: "e2e-tests/tests",
  // 本来は flaky テストをなくすべきだが、一時的に対応
  retries: 3,
  workers: 1,
```

「本来は flaky テストをなくすべき」というコメントが入ったまま追跡 Issue 番号も期限もなく残置されている。

固定 `waitForTimeout(...)` も多数残置:

- `e2e-tests/tests/sendonly_recvonly.test.ts:48`
- `e2e-tests/tests/simulcast_rid.test.ts:41`
- `e2e-tests/tests/spotlight_sendrecv.test.ts:34-35`
- `e2e-tests/tests/sendrecv.test.ts:68-69`
- `e2e-tests/tests/rpc.test.ts:67, 101, 130`
- 他多数

## 設計方針

1. `retries` を `process.env.CI ? 1 : 0` に下げる
2. Playwright の JSON reporter を併用し `flaky > 0` ならジョブを fail させる post-step を追加
3. 固定 `waitForTimeout` を `waitForFunction(...)` ベースの決定的待機に置き換える
4. issue 0023（Slack 通知の `job.status` 修正）と同時に進める

## 完了条件

- `retries` が `1` 以下に下がる
- flaky 数を計測して CI で可視化される
- 主要 E2E から固定 `waitForTimeout` が消える

## 解決方法

```ts
retries: process.env.CI ? 1 : 0,
reporter: process.env.CI
  ? [["list"], ["json", { outputFile: "playwright-report.json" }]]
  : "list",
```

各 workflow の `playwright test` step の後に:

```yaml
- name: Fail on flaky
  if: always()
  run: |
    FLAKY=$(jq -r '[.suites[].suites[].specs[] | select(.tests[].results[].status == "passed" and (.tests[].results | length > 1))] | length' playwright-report.json)
    if [ "$FLAKY" -gt 0 ]; then
      echo "Found $FLAKY flaky tests"
      exit 1
    fi
```

固定 `waitForTimeout` の置き換えはテスト個別に対応（別 issue 化候補だが本 issue 内のスコープでも可）。
