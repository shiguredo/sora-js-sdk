# E2E の `waitForTimeout(...)` を決定的待機に置き換える

- Priority: Medium
- Created: 2026-05-25
- Model: Composer 2.5
- Branch: feature/refactor-e2e-waitfortimeout

## 目的

`e2e-tests/tests/` 配下の固定 `waitForTimeout(...)` を `waitForFunction` / `waitForSelector` / `expect.poll` 等の決定的待機に置き換え、flaky の根本原因を減らす。issue 0027 の retries 削減と併せて CI 信頼性を上げる。

## 優先度根拠

Medium。0027 は flaky **検出** インフラ (retries 削減 + JSON reporter)。本 issue は flaky **原因** の削減。0027 適用後、固定 sleep 依存テストは retry 1 回でも落ちやすくなるため、本対応が実質必須になる。

## 現状

着手時に次で対象を網羅する:

```bash
grep -rn "waitForTimeout" e2e-tests/tests/
```

2026-05-25 時点の grep 結果 (13 ファイル、計 22 箇所。`e2e-tests/tests/` 外に `waitForTimeout` は無い):

| ファイル                            | 行           | 待っている対象 (推定)               | 置換方針                                                                                          |
| ----------------------------------- | ------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `authz_simulcast_encodings.test.ts` | 44           | connect 後 stats 安定               | `#get-stats` click 後 `expect.poll` で outbound-rtp `bytesSent > 0`                               |
| `stereo_audio.test.ts`              | 68, 164      | connect 後 analyser 安定            | `#audio-analysis` dataset または stats `bytesSent > 0` (0029 マージ後は stats assert と整合)      |
| `stereo_audio_sendrecv.test.ts`     | 65, 189, 278 | 同上                                | 同上                                                                                              |
| `sendrecv.test.ts`                  | 68-69        | 双方向 stats 安定                   | 各 page で stats `bytesSent > 0`                                                                  |
| `webkit.test.ts`                    | 73-74, 221   | stats / メディア安定                | stats または `#local-video-connection-id:not(:empty)`                                             |
| `simulcast_rid.test.ts`             | 41           | simulcast layer / inbound-rtp 安定  | `#stats-report` 内 inbound-rtp 件数 > 0 または simulcast 関連行                                   |
| `simulcast.test.ts`                 | 14           | connect 後 DOM 準備 (5s 固定)       | **14 行目の sleep は削除不可の代替ではない**。`:16-39` の selector 待ちで十分なら 14 行目ごと削除 |
| `sendonly_recvonly.test.ts`         | 48-49        | stats 安定                          | stats `bytesSent > 0`                                                                             |
| `sendonly_audio.test.ts`            | 47           | stats 安定                          | stats `bytesSent > 0`                                                                             |
| `rpc.test.ts`                       | 67, 101, 130 | RID 切替 / RPC 応答後 DOM 更新      | 対象 selector (例: `#rid-status`, `#rpc-result`) の `waitForFunction`                             |
| `h265.test.ts`                      | 69-70        | stats 安定                          | stats `bytesSent > 0`                                                                             |
| `spotlight_sendrecv.test.ts`        | 34-35        | stats 安定                          | stats `bytesSent > 0`                                                                             |
| `reconnect.test.ts`                 | 35           | 初回 connect 安定化 (disconnect 前) | `#local-video-connection-id:not(:empty)`                                                          |

### 共通ヘルパー (推奨)

各 test ファイルに同型 `expect.poll` を散在させないため、`e2e-tests/tests/helper.ts` (既存) に stats 待ち関数を追加してもよい:

```ts
export async function waitForOutboundRtpBytesSent(page: Page, minBytes = 1): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const json = document.querySelector("#stats-report")?.dataset.statsReportJson ?? "[]";
        const stats = JSON.parse(json) as Array<Record<string, unknown>>;
        return stats.some((s) => s.type === "outbound-rtp" && Number(s.bytesSent ?? 0) >= minBytes);
      });
    })
    .toBe(true);
}
```

fixture によって `#stats-report` が無い場合は、その page 固有の selector を使う (表の置換方針に従う)。

## 設計方針

- 固定 ms 待機に **戻さない**
- `waitForFunction` / `expect.poll` の timeout は Playwright デフォルト (30s) を基本。短縮が必要なら test 単位で明示
- 置換後も test の意図 (何を待っているか) がコード上で読めること
- PR はファイル単位分割可。1 PR あたり 1〜3 ファイル程度を推奨

### 0029 との関係

`stereo_audio.test.ts` / `stereo_audio_sendrecv.test.ts` は issue 0029 (stereo assert 強化) と同一ファイルを触る。

- **0029 マージ後** に本 issue を当てる、または 1 PR にまとめる
- 0029 で追加する stats / SDP assert と、本 issue の `expect.poll` 待機は矛盾しないよう統合する

### 0027 との関係

**着手前条件**: issue 0027 (flaky 検出) がマージ済みであること。0027 未マージのまま大量置換すると flaky 顕在化のタイミングが読みにくい。

## 完了条件

- `grep -rn "waitForTimeout" e2e-tests/tests/` が **0 件** になる
- 上表の全箇所が決定的待機に置換されている
- 各置換は DOM 状態 / stats / connection 状態が安定する条件を待つ (固定 sleep 禁止)
- ローカルで `pnpm e2e-test` が通ること
- issue 0027 マージ後に CI で flaky が増えていないことを確認する (0027 の JSON reporter `stats.flaky === 0`)
- CHANGES.md `## develop` の `### misc` に次のエントリを追記する

  ```
  ### misc

  - [UPDATE] E2E テストの waitForTimeout を決定的待機に置き換え flaky の根本原因を減らす
    - @voluntas
  ```

### 置換例

`stereo_audio.test.ts` の connect 後待機 — fixture 実態に合わせる:

```ts
await page.click("#get-stats");
await expect
  .poll(async () => {
    return page.evaluate(() => {
      const json = document.querySelector("#stats-report")?.dataset.statsReportJson ?? "[]";
      const stats = JSON.parse(json) as Array<Record<string, unknown>>;
      return stats.some((s) => s.type === "outbound-rtp" && Number(s.bytesSent ?? 0) > 0);
    });
  })
  .toBe(true);
```

`simulcast.test.ts` — 14 行目 `waitForTimeout(5000)` は、直後の `#local-video-connection-id:not(:empty)` 等の selector 待ちで代替可能なら **行ごと削除** する。削除不可 (selector 待ちだけでは不足) の場合は、不足理由を PR 説明に明記し、決定的条件を追加してから sleep を削除する。
