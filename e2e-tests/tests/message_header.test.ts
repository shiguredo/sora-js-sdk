import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  checkSoraVersion,
  unsupportedVersionSkipReason,
  filterDataChannelStats,
  findDataChannelStats,
  getStatsReportJson,
} from "./helper";

test("messaging pages with header", async ({ browser }) => {
  // 2つの独立したブラウザコンテキストを作成
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  // それぞれのページに対して操作を行う
  await page1.goto("http://localhost:9000/messaging/");
  await page2.goto("http://localhost:9000/messaging/");

  // sora js sdk のバージョンをチェック
  const versionCheck = await checkSoraVersion(page1, {
    featureName: "Messaging with header",
    majorVersion: 2024,
    minorVersion: 2,
  });

  test.skip(!versionCheck.isSupported, unsupportedVersionSkipReason(versionCheck.skipReason));

  // チャンネル名を uuid 文字列にする
  const channelName = randomUUID();

  // チャンネル名を設定
  await page1.fill("#channel-name", channelName);
  await page2.fill("#channel-name", channelName);

  // header を有効にする
  await page1.check("#check-header");
  await page2.check("#check-header");

  // connect ボタンを押して接続開始
  await page1.click("#connect");
  await page2.click("#connect");

  await page1.waitForSelector("#connection-id:not(:empty)");
  const page1ConnectionId = await page1.$eval("#connection-id", (el) => el.textContent);
  console.log(`page1 connectionId=${page1ConnectionId}`);

  await page2.waitForSelector("#connection-id:not(:empty)");
  const page2ConnectionId = await page2.$eval("#connection-id", (el) => el.textContent);
  console.log(`page2 connectionId=${page2ConnectionId}`);

  // page1 で #example の DataChannel が open したことを確認
  await page1.waitForSelector("#messaging li", { state: "attached" });

  // page2 で #example の DataChannel が open したことを確認
  await page2.waitForSelector("#messaging li", { state: "attached" });

  // page1からpage2へメッセージを送信
  const page1Message = "Hello from page1";
  await page1.fill('input[name="message"]', page1Message);
  await page1.click("#send-message");

  // page2でメッセージが受信されたことを確認
  await page2.waitForSelector("#received-messages li", { state: "attached" });
  const receivedMessage1 = await page2.$eval("#received-messages li", (el) => el.textContent);

  // 受信したメッセージが期待したものであるか検証
  // receivedMessage の先頭 26 バイトには sender_connection_id が含まれている
  test.expect(receivedMessage1?.slice(0, 26)).toBe(page1ConnectionId);
  // 27 文字目からは page1 のメッセージがそのまま
  test.expect(receivedMessage1).toContain(page1Message);

  // page2からpage1へメッセージを送信
  const page2Message = "Hello from page2";
  await page2.fill('input[name="message"]', page2Message);
  await page2.click("#send-message");

  // page1でメッセージが受信されたことを確認
  await page1.waitForSelector("#received-messages li", { state: "attached" });
  const receivedMessage2 = await page1.$eval("#received-messages li", (el) => el.textContent);

  // 受信したメッセージが期待したものであるか検証
  console.log(`Received message on page1: ${receivedMessage2}`);
  // receivedMessage の先頭 26 バイトには sender_connection_id が含まれている
  test.expect(receivedMessage2?.slice(0, 26)).toBe(page2ConnectionId);
  // 27 文字目からは page2 のメッセージがそのまま
  test.expect(receivedMessage2).toContain(page2Message);

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await page1.click("#get-stats");
  await page2.click("#get-stats");

  // 統計情報が表示されるまで待機
  await page1.waitForSelector("#stats-report");
  // データセットから統計情報を取得
  const page1StatsReportJson = await getStatsReportJson(page1);

  // page1 stats report
  const page1DataChannelStats = filterDataChannelStats(page1StatsReportJson);

  expect(findDataChannelStats(page1DataChannelStats, "signaling", "open")).toBeDefined();
  expect(findDataChannelStats(page1DataChannelStats, "push", "open")).toBeDefined();
  expect(findDataChannelStats(page1DataChannelStats, "notify", "open")).toBeDefined();
  expect(findDataChannelStats(page1DataChannelStats, "stats", "open")).toBeDefined();

  const page1ExampleStats = findDataChannelStats(page1DataChannelStats, "#example", "open");
  // ここで undefined ではないことを確認してる
  expect(page1ExampleStats).toBeDefined();
  expect(page1ExampleStats?.messagesSent).toBeGreaterThan(0);
  expect(page1ExampleStats?.bytesSent).toBeGreaterThan(0);
  expect(page1ExampleStats?.messagesSent).toBeGreaterThan(0);

  // 統計情報が表示されるまで待機
  await page2.waitForSelector("#stats-report");
  // データセットから統計情報を取得
  const page2StatsReportJson = await getStatsReportJson(page2);

  // page2 stats report
  const page2DataChannelStats = filterDataChannelStats(page2StatsReportJson);

  expect(findDataChannelStats(page2DataChannelStats, "signaling", "open")).toBeDefined();
  expect(findDataChannelStats(page2DataChannelStats, "push", "open")).toBeDefined();
  expect(findDataChannelStats(page2DataChannelStats, "notify", "open")).toBeDefined();
  expect(findDataChannelStats(page2DataChannelStats, "stats", "open")).toBeDefined();

  const page2ExampleStats = findDataChannelStats(page2DataChannelStats, "#example", "open");
  // ここで undefined ではないことを確認してる
  expect(page2ExampleStats).toBeDefined();
  expect(page2ExampleStats?.bytesReceived).toBeGreaterThan(0);
  expect(page2ExampleStats?.messagesReceived).toBeGreaterThan(0);
  expect(page2ExampleStats?.bytesSent).toBeGreaterThan(0);
  expect(page2ExampleStats?.messagesSent).toBeGreaterThan(0);

  await page1.click("#disconnect");
  await page2.click("#disconnect");

  await page1.close();
  await page2.close();
  await context1.close();
  await context2.close();
});
