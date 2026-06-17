import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { checkSoraVersion, unsupportedVersionSkipReason } from "./helper";

// disconnect() の signalingSwitched === true 経路で、disconnectDataChannel() が
// `{ code: 4999 }` を返したときに event を normal で上書きせず abend として
// アプリへ通知することを確認する E2E テスト。
//
// 再現条件:
// - data_channel_signaling_only fixture (`ignoreDisconnectWebSocket: true`、`dataChannelSignaling: true`)
// - `disconnectWaitTimeout=0` を URL クエリで渡し、`disconnect()` 内の
//   `Promise.race` を timeout 側に確実に倒す。これにより `disconnectDataChannel()` の
//   catch (`reason: "DISCONNECT-WAIT-TIMEOUT-ERROR"`) を踏ませて code 4999 を返させる。
//
// スコープ:
// - 本 fix の対象は `disconnect()` 内の `signalingSwitched === true` 経路かつ
//   timeout サブ経路 (`DisconnectWaitTimeoutError`) に限定する。
// - 他の 4999 サブ経路 (`DisconnectInternalError` / `DisconnectDataChannelError`) は
//   本 fix の if/else 分岐自体は同じ経路を通るため、サブ経路を 1 つ踏めば回帰検知できる。
//   onerror 発火を再現する fixture は AGENTS.md の「モック・スタブ禁止」と整合せず追加しない。
// - 938 経路 (`!this.soraDataChannels.signaling`) は `signalingSwitched === false` 側のため
//   本 fix の修正範囲外。
// - normal 経路 (4999 ではない `code: 1000` / `reason: "TYPE-DISCONNECT"`) の確認は別 issue (0002)
//   で `#disconnect-count` を含めて追加する想定のため本テストでは扱わない。
// - 単体テスト (vitest) は `soraCloseEvent` が private のため追加できない。E2E のみで担保する。
test("signaling switched 後の disconnect で timeout サブ経路を踏むと event type が abend になることを確認する", async ({
  browser,
}) => {
  const page = await browser.newPage();

  // disconnectWaitTimeout=0 にすると、`Promise.race` の timeout Promise が
  // 次のマクロタスクで reject する。一方 DataChannel の正常 close は Sora との
  // 往復 (最低 1 RTT) を要するため、実運用 RTT 下では timeout が安定して先勝ちする。
  await page.goto("http://localhost:9000/data_channel_signaling_only/?disconnectWaitTimeout=0");

  // バージョンチェック。本 fix のリグレッション検知を目的とするため、fix が入った
  // SDK バージョン以降でのみテストを実行する。
  const versionCheck = await checkSoraVersion(page, {
    featureName: "disconnect abend on code 4999",
    majorVersion: 2026,
    minorVersion: 1,
  });

  test.skip(!versionCheck.isSupported, unsupportedVersionSkipReason(versionCheck.skipReason));

  console.log(`sdkVersion=${versionCheck.version}`);

  const channelName = randomUUID();
  await page.fill("#channel-name", channelName);

  await page.click("#connect");

  // connection-id が設定されるまで待つ
  await page.waitForSelector("#connection-id:not(:empty)");

  const connectionId = await page.$eval("#connection-id", (el) => el.textContent);
  console.log(`connectionId=${connectionId}`);

  // switched コールバックが呼ばれて #switched-status が 'switched' になるまで待つ。
  // switched 後は signaling DataChannel が存在するため、938 経路の
  // "DISCONNECT-INTERNAL-ERROR" には入らないことが保証される。
  await page.waitForSelector("#switched-status:not(:empty)");
  const switchedStatus = await page.$eval("#switched-status", (el) => el.textContent);
  expect(switchedStatus).toBe("switched");

  await page.click("#disconnect");

  // disconnect callback が呼ばれて event.type が abend になることを確認する。
  // 修正前は無条件で normal に上書きされていたため、ここが abend になることが本 fix の本丸。
  await expect(page.locator("#disconnect-event-type")).toHaveText("abend", { timeout: 5000 });

  // 4999 のサブ経路を限定するため reason まで確認する。
  // 938 経路の "DISCONNECT-INTERNAL-ERROR" や DC onerror 経路の
  // "DISCONNECT-DATA-CHANNEL-ERROR" との誤検知を防ぐ。
  // type / reason は同じ onDisconnect で同時に DOM 反映されるため、type が
  // abend に到達した直後に reason も決まっている前提で短い timeout で十分。
  await expect(page.locator("#disconnect-event-reason")).toHaveText(
    "DISCONNECT-WAIT-TIMEOUT-ERROR",
    { timeout: 1000 },
  );

  await page.close();
});
