import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  findCodecStats,
  findInboundRtpStats,
  findOutboundRtpStats,
  getStatsReportJson,
} from "./helper";

test("sendrecv x2", async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const sendrecv1 = await context1.newPage();
  const sendrecv2 = await context2.newPage();

  await sendrecv1.goto("http://localhost:9000/sendrecv/");
  await sendrecv2.goto("http://localhost:9000/sendrecv/");

  const channelName = randomUUID();

  // チャンネル名を設定
  await sendrecv1.fill("#channel-name", channelName);
  await sendrecv2.fill("#channel-name", channelName);

  console.log(`sendrecv1 channelName: ${channelName}`);
  console.log(`sendrecv2 channelName: ${channelName}`);

  // sendrecv1 のビデオコーデックをランダムに選択
  await sendrecv1.evaluate(() => {
    const videoCodecTypeSelect = document.querySelector<HTMLSelectElement>("#video-codec-type")!;
    const options = [...videoCodecTypeSelect.options].filter((option) => option.value !== "");
    const randomIndex = Math.floor(Math.random() * options.length);
    videoCodecTypeSelect.value = options[randomIndex].value;
  });

  // sendrecv2 のビデオコーデックをランダムに選択
  await sendrecv2.evaluate(() => {
    const videoCodecTypeSelect = document.querySelector<HTMLSelectElement>("#video-codec-type")!;
    const options = [...videoCodecTypeSelect.options].filter((option) => option.value !== "");
    const randomIndex = Math.floor(Math.random() * options.length);
    videoCodecTypeSelect.value = options[randomIndex].value;
  });

  // 選択されたコーデックをログに出力
  const sendrecv1VideoCodecType = await sendrecv1.$eval(
    "#video-codec-type",
    (el) => (el as HTMLSelectElement).value,
  );
  const sendrecv2VideoCodecType = await sendrecv2.$eval(
    "#video-codec-type",
    (el) => (el as HTMLSelectElement).value,
  );
  console.log(`sendrecv1 videoCodecType: ${sendrecv1VideoCodecType}`);
  console.log(`sendrecv2 videoCodecType: ${sendrecv2VideoCodecType}`);

  await sendrecv1.click("#connect");
  await sendrecv2.click("#connect");

  // #connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendrecv1.waitForSelector("#connection-id:not(:empty)");

  // #connection-id 要素の内容を取得
  const sendrecv1ConnectionId = await sendrecv1.$eval("#connection-id", (el) => el.textContent);
  console.log(`sendrecv1 connectionId=${sendrecv1ConnectionId}`);

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendrecv2.waitForSelector("#connection-id:not(:empty)");

  // #sendrecv1-connection-id 要素の内容を取得
  const sendrecv2ConnectionId = await sendrecv2.$eval("#connection-id", (el) => el.textContent);
  console.log(`sendrecv2 connectionId=${sendrecv2ConnectionId}`);

  // レース対策
  await sendrecv1.waitForTimeout(5000);
  await sendrecv2.waitForTimeout(5000);

  // page1 stats report

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await sendrecv1.click("#get-stats");
  await sendrecv2.click("#get-stats");

  // 統計情報が表示されるまで待機
  await sendrecv1.waitForSelector("#stats-report");
  await sendrecv2.waitForSelector("#stats-report");

  // データセットから統計情報を取得
  const sendrecv1StatsReportJson = await getStatsReportJson(sendrecv1);

  const sendrecv1AudioCodecStats = findCodecStats(sendrecv1StatsReportJson, "audio/opus");
  expect(sendrecv1AudioCodecStats).toBeDefined();

  const sendrecv1VideoCodecStats = findCodecStats(
    sendrecv1StatsReportJson,
    `video/${sendrecv1VideoCodecType}`,
  );
  expect(sendrecv1VideoCodecStats).toBeDefined();

  const sendrecv1AudioOutboundRtpStats = findOutboundRtpStats(sendrecv1StatsReportJson, "audio");
  expect(sendrecv1AudioOutboundRtpStats).toBeDefined();
  expect(sendrecv1AudioOutboundRtpStats?.bytesSent).toBeGreaterThan(0);
  expect(sendrecv1AudioOutboundRtpStats?.packetsSent).toBeGreaterThan(0);

  const sendrecv1VideoOutboundRtpStats = findOutboundRtpStats(sendrecv1StatsReportJson, "video");
  expect(sendrecv1VideoOutboundRtpStats).toBeDefined();
  expect(sendrecv1VideoOutboundRtpStats?.bytesSent).toBeGreaterThan(0);
  expect(sendrecv1VideoOutboundRtpStats?.packetsSent).toBeGreaterThan(0);

  const sendrecv1AudioInboundRtpStats = findInboundRtpStats(sendrecv1StatsReportJson, "audio");
  expect(sendrecv1AudioInboundRtpStats).toBeDefined();
  expect(sendrecv1AudioInboundRtpStats?.bytesReceived).toBeGreaterThan(0);
  expect(sendrecv1AudioInboundRtpStats?.packetsReceived).toBeGreaterThan(0);

  const sendrecv1VideoInboundRtpStats = findInboundRtpStats(sendrecv1StatsReportJson, "video");
  expect(sendrecv1VideoInboundRtpStats).toBeDefined();
  expect(sendrecv1VideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0);
  expect(sendrecv1VideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0);

  const sendrecv2StatsReportJson = await getStatsReportJson(sendrecv2);

  const sendrecv2AudioCodecStats = findCodecStats(sendrecv2StatsReportJson, "audio/opus");
  expect(sendrecv2AudioCodecStats).toBeDefined();

  const sendrecv2VideoCodecStats = findCodecStats(
    sendrecv2StatsReportJson,
    `video/${sendrecv2VideoCodecType}`,
  );
  expect(sendrecv2VideoCodecStats).toBeDefined();

  const sendrecv2AudioOutboundRtpStats = findOutboundRtpStats(sendrecv2StatsReportJson, "audio");
  expect(sendrecv2AudioOutboundRtpStats).toBeDefined();
  expect(sendrecv2AudioOutboundRtpStats?.bytesSent).toBeGreaterThan(0);
  expect(sendrecv2AudioOutboundRtpStats?.packetsSent).toBeGreaterThan(0);

  const sendrecv2VideoOutboundRtpStats = findOutboundRtpStats(sendrecv2StatsReportJson, "video");
  expect(sendrecv2VideoOutboundRtpStats).toBeDefined();
  expect(sendrecv2VideoOutboundRtpStats?.bytesSent).toBeGreaterThan(0);
  expect(sendrecv2VideoOutboundRtpStats?.packetsSent).toBeGreaterThan(0);

  const sendrecv2AudioInboundRtpStats = findInboundRtpStats(sendrecv2StatsReportJson, "audio");
  expect(sendrecv2AudioInboundRtpStats).toBeDefined();
  expect(sendrecv2AudioInboundRtpStats?.bytesReceived).toBeGreaterThan(0);
  expect(sendrecv2AudioInboundRtpStats?.packetsReceived).toBeGreaterThan(0);

  const sendrecv2VideoInboundRtpStats = findInboundRtpStats(sendrecv2StatsReportJson, "video");
  expect(sendrecv2VideoInboundRtpStats).toBeDefined();
  expect(sendrecv2VideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0);
  expect(sendrecv2VideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0);

  await sendrecv1.click("#disconnect");
  await sendrecv2.click("#disconnect");

  await sendrecv1.close();
  await sendrecv2.close();
  await context1.close();
  await context2.close();
});
