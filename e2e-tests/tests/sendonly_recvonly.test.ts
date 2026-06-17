import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  findCodecStats,
  findInboundRtpStats,
  findOutboundRtpStats,
  getStatsReportJson,
} from "./helper";

test("sendonly/recvonly pages", async ({ browser }) => {
  // 新しいコンテキストとページを2つ作成
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const sendonly = await context1.newPage();
  const recvonly = await context2.newPage();

  // それぞれのページに対して操作を行う
  await sendonly.goto("http://localhost:9000/sendonly/");
  await recvonly.goto("http://localhost:9000/recvonly/");

  const channelName = randomUUID();

  // チャンネル名を設定
  await sendonly.fill("#channel-name", channelName);
  await recvonly.fill("#channel-name", channelName);

  // ビデオコーデックを設定
  const videoCodecType = "VP9";
  await sendonly.selectOption("#video-codec-type", videoCodecType);

  // SDK バージョンの表示
  await sendonly.waitForSelector("#sora-js-sdk-version");
  const sendonlySdkVersion = await sendonly.$eval("#sora-js-sdk-version", (el) => el.textContent);
  console.log(`sendonly sdkVersion=${sendonlySdkVersion}`);

  await recvonly.waitForSelector("#sora-js-sdk-version");
  const recvonlySdkVersion = await recvonly.$eval("#sora-js-sdk-version", (el) => el.textContent);
  console.log(`recvonly sdkVersion=${recvonlySdkVersion}`);

  await sendonly.click("#connect");
  await recvonly.click("#connect");

  // sendonly の #connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendonly.waitForSelector("#connection-id:not(:empty)");

  // sendonly の #connection-id 要素の内容を取得
  const sendonlyConnectionId = await sendonly.$eval("#connection-id", (el) => el.textContent);
  console.log(`sendonly connectionId=${sendonlyConnectionId}`);

  // recvonly の #connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await recvonly.waitForSelector("#connection-id:not(:empty)");

  // recvonly の #connection-id 要素の内容を取得
  const recvonlyConnectionId = await recvonly.$eval("#connection-id", (el) => el.textContent);
  console.log(`recvonly connectionId=${recvonlyConnectionId}`);

  // レース対策
  await sendonly.waitForTimeout(3000);
  await recvonly.waitForTimeout(3000);

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await sendonly.click("#get-stats");

  // 統計情報が表示されるまで待機
  await sendonly.waitForSelector("#stats-report");
  // データセットから統計情報を取得
  const sendonlyStatsReportJson = await getStatsReportJson(sendonly);

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await recvonly.click("#get-stats");

  // 統計情報が表示されるまで待機
  await recvonly.waitForSelector("#stats-report");
  // データセットから統計情報を取得
  const recvonlyStatsReportJson = await getStatsReportJson(recvonly);

  // sendonly audio codec
  const sendonlyAudioCodecStats = findCodecStats(sendonlyStatsReportJson, "audio/opus");
  expect(sendonlyAudioCodecStats).toBeDefined();

  // sendonly audio outbound-rtp
  const sendonlyAudioOutboundRtp = findOutboundRtpStats(sendonlyStatsReportJson, "audio");
  expect(sendonlyAudioOutboundRtp).toBeDefined();
  expect(sendonlyAudioOutboundRtp?.bytesSent).toBeGreaterThan(0);
  expect(sendonlyAudioOutboundRtp?.packetsSent).toBeGreaterThan(0);

  // sendonly video codec
  const sendonlyVideoCodecStats = findCodecStats(sendonlyStatsReportJson, "video/VP9");
  expect(sendonlyVideoCodecStats).toBeDefined();

  // sendonly video outbound-rtp
  const sendonlyVideoOutboundRtpStats = findOutboundRtpStats(sendonlyStatsReportJson, "video");
  expect(sendonlyVideoOutboundRtpStats).toBeDefined();
  expect(sendonlyVideoOutboundRtpStats?.bytesSent).toBeGreaterThan(0);
  expect(sendonlyVideoOutboundRtpStats?.packetsSent).toBeGreaterThan(0);

  // recvonly audio codec
  const recvonlyAudioCodecStats = findCodecStats(recvonlyStatsReportJson, "audio/opus");
  expect(recvonlyAudioCodecStats).toBeDefined();

  // recvonly audio inbound-rtp
  const recvonlyAudioInboundRtpStats = findInboundRtpStats(recvonlyStatsReportJson, "audio");
  expect(recvonlyAudioInboundRtpStats).toBeDefined();
  expect(recvonlyAudioInboundRtpStats?.bytesReceived).toBeGreaterThan(0);
  expect(recvonlyAudioInboundRtpStats?.packetsReceived).toBeGreaterThan(0);

  // recvonly video codec
  const recvonlyVideoCodecStats = findCodecStats(recvonlyStatsReportJson, "video/VP9");
  expect(recvonlyVideoCodecStats).toBeDefined();

  // recvonly video inbound-rtp
  const recvonlyVideoInboundRtpStats = findInboundRtpStats(recvonlyStatsReportJson, "video");
  expect(recvonlyVideoInboundRtpStats).toBeDefined();
  expect(recvonlyVideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0);
  expect(recvonlyVideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0);

  await sendonly.click("#disconnect");
  await recvonly.click("#disconnect");

  await sendonly.close();
  await recvonly.close();
  await context1.close();
  await context2.close();
});
