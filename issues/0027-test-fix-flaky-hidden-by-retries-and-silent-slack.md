# `retries: 3` と Slack 通知不発の組み合わせで flaky テストが完全に隠蔽される

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-flaky-detection

## 目的

`playwright.config.ts:8` が `retries: 3` を無条件で指定しており、E2E が 4 回まで再実行されて 1 回でも通れば全体 success と判定される。issue 0023 の Slack 通知不発 (`job.status` 誤参照) と組み合わさり、flaky テストが完全に隠蔽されたまま develop が更新され、タグ push → `npm-publish.yml` で壊れた SDK が npm latest に出る経路が成立する。`retries` を CI 環境のみ `1` に絞り、Playwright の JSON reporter を併用して flaky 検出時に CI ジョブを fail させる。固定 `waitForTimeout(...)` を確認できるテストファイル群は別 issue に切り出して順次決定的待機に置き換える。

## 優先度根拠

High。リリース判定の根拠そのものが崩壊している。本番に近い回帰バグが develop で繰り返し発生していても、retries で吸収され Slack 通知 (issue 0023 で別途修正) も発火しないため気付けない。本 issue は CI 検知精度を取り戻す前提条件。

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

「本来は flaky テストをなくすべき」というコメントが入ったまま、追跡 issue 番号も期限もなく残置されている。`reporter: "list"` は CI 上で失敗ステップを `--reporter list` で表示するのみで、flaky 検出のための機械可読出力が無い。

固定 `waitForTimeout(...)` を呼ぶ E2E テストファイル (`e2e-tests/tests/`) は本 issue 着手時に `grep -rn "waitForTimeout" e2e-tests/tests/` で網羅的に確認する。決定的待機 (`waitForFunction` / `waitForSelector` / `expect.poll`) への置き換えは個別に難易度が異なるため、本 issue では「CI で flaky を検出するインフラ整備」に絞り、テスト書き換えは別 issue 雛形として `issues/SEQUENCE` から採番して登録する。

issue 0023 で Slack 通知の `status` 引数が `needs.*.result` を参照する形に修正された後は、`retries` 適用後でも flaky 検出ステップが fail すれば Slack に通知が飛ぶ。0023 が先にマージされていることが本 issue の効果を発揮する前提となる。

## 完了条件

- `playwright.config.ts:8` を `retries: process.env.CI ? 1 : 0` に変更する。ローカルでは retry しない (0 回)、CI のみ 1 回 retry する。`retries: 3` の隠蔽効果を抑える
- `playwright.config.ts:11` の `reporter: "list"` を、CI 時のみ JSON reporter を併用する形に変更する
  ```ts
  reporter: process.env.CI
    ? [["list"], ["json", { outputFile: "playwright-report.json" }]]
    : "list",
  ```
- 各 E2E workflow (`.github/workflows/e2e-test.yml`、`e2e-test-canary.yml`、`e2e-test-h265.yml`、`e2e-test-webkit.yml`、`npm-pkg-e2e-test.yml`) の `playwright test` step の **直後** に「flaky 検出ステップ」を追加する。`always()` で fail 時も走らせ、`playwright-report.json` から `flaky` 件数を集計して 0 でなければ fail させる
- 「`waitForTimeout(...)` 置き換え」は本 issue では行わない。`issues/SEQUENCE` から 1 つ採番して別 issue 雛形を作成し、本 issue 着手前に `issues/` 配下に登録する。雛形には対象テストファイル一覧 (`e2e-tests/tests/sendonly_recvonly.test.ts`、`simulcast_rid.test.ts`、`spotlight_sendrecv.test.ts`、`sendrecv.test.ts`、`rpc.test.ts` 他、grep で網羅的に確認) を列挙する
- CHANGES.md `## develop` の `### misc` セクションに次のエントリを追記する

  ```
  ### misc

  - [FIX] Playwright の retries を CI のみ 1 に下げ、JSON reporter で flaky を検出して CI で fail させるようにする
    - @voluntas
  ```

- 本 issue は issue 0023 (Slack 通知) の修正効果を発揮するための前提条件で、マージ順は 0023 → 0027 を推奨する。0027 が先にマージされても retry 削減で CI が落ちるだけで Slack 通知は飛ばない (0023 未修正) ため、効果は限定的

## 解決方法

`playwright.config.ts:5-12` を次の通り書き換える。

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

各 E2E workflow の `playwright test` ステップ直後に次のステップを追加する (`e2e-test.yml` を例に)。

```yaml
- name: Detect flaky tests
  if: always()
  run: |
    if [ ! -f playwright-report.json ]; then
      echo "playwright-report.json not found"
      exit 0
    fi
    FLAKY=$(jq -r '[.. | .status? | select(. == "flaky")] | length' playwright-report.json)
    echo "Flaky tests: ${FLAKY}"
    if [ "$FLAKY" -gt 0 ]; then
      echo "Failing job because flaky tests detected"
      exit 1
    fi
```

`jq` クエリは Playwright JSON reporter (v1.x) の出力構造に合わせる。実際の出力構造 (`suites[].suites[].specs[].tests[].results[]` のネスト) と `flaky` ステータスの判定基準は Playwright のバージョンによって変わるため、着手時に `playwright test --reporter=json` をローカル実行してフィールド構造を確認した上でクエリを調整する。`tests[].results[]` の長さが 1 より大きく status が `"passed"` のケースを flaky と判定する jq クエリでもよい。

各 workflow への step 追加は `e2e-test.yml`、`e2e-test-canary.yml`、`e2e-test-h265.yml`、`e2e-test-webkit.yml`、`npm-pkg-e2e-test.yml` の 5 本に対して行う。`if: always()` で test step が fail しても走らせて、最終的に flaky > 0 の方を強制 fail で表面化させる。

固定 `waitForTimeout` の置き換えは本 issue のスコープ外。別 issue 雛形を `issues/` 配下に作成しておく。
