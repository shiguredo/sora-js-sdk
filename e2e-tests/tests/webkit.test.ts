import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  findCodecStats,
  findInboundRtpStats,
  findOutboundRtpStats,
  findOutboundRtpStatsByRid,
  findVideoCodecStats,
  getStatsReportJson,
  shouldSkipWebKitTest,
} from "./helper";

test("WebKit", async ({ browser }) => {
  test.skip(shouldSkipWebKitTest(test.info().project.name), "WebKit かつ macOS でのみテストを行う");

  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const sendrecv1 = await context1.newPage();
  const sendrecv2 = await context2.newPage();

  await sendrecv1.goto("http://localhost:9000/sendrecv_webkit/");
  await sendrecv2.goto("http://localhost:9000/sendrecv_webkit/");

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

// Playwright の WebKit は scaleResolutionDownTo を適用しないため、このテストは fail する
// (Playwright 1.63.0 同梱の WebKit 26.6 で確認。WebKit のバージョンによっては変わり得る)
// 適用された場合は 960x540 のソースが r0 = 400x225、r1 = 800x450 相当になる
// (幅で確認する。高さはエンコーダのアラインメントで 224 / 448 になることがある)。
// 適用されない場合は WebKit 独自の既定スケーリングで r0 = 240x135、r1 = 480x270 になる
test.fail("WebKit Authz simulcast_encodings ScaleResolutionDownTo", async ({ page }) => {
  test.skip(shouldSkipWebKitTest(test.info().project.name), "WebKit かつ macOS でのみテストを行う");

  await page.goto("http://localhost:9000/simulcast_sendonly_webkit/");

  const channelName = randomUUID();

  await page.fill("#channel-name", channelName);

  // WebKit は VP9 では simulcast のレイヤーを 1 本しか送出しないため、
  // r0 / r1 の 2 レイヤーを確認できる VP8 を明示する
  // (Playwright の WebKit 26.6 で確認。WebKit のバージョンによっては変わり得る)
  const videoCodecType = "VP8";
  await page.selectOption("#video-codec-type", videoCodecType);

  // videoBitRate は r0 / r1 が送出されることを確認済みの 1500 を明示する
  // (fixture の既定値に依存しない)
  await page.fill("#video-bit-rate", "1500");

  // Sora の authz スキーマでは scaleResolutionDownTo を maxHeight / maxWidth で指定する
  // scaleResolutionDownTo 自体は Chrome 131 / Edge 131 以降で利用できる
  // scalabilityMode は WebKit の IDL に存在せず無視されるため assertion しない
  // (WebKit 26.6 の outbound-rtp では既定値の L1T3 が返る)。Sora の authz スキーマに
  // 合わせて指定だけは残す
  await page.fill(
    "#simulcast-encodings",
    JSON.stringify([
      {
        active: true,
        rid: "r0",
        scalabilityMode: "L1T1",
        scaleResolutionDownTo: { maxHeight: 225, maxWidth: 400 },
      },
      {
        active: true,
        rid: "r1",
        scalabilityMode: "L1T1",
        scaleResolutionDownTo: { maxHeight: 450, maxWidth: 800 },
      },
      { active: false, rid: "r2" },
    ]),
  );

  await page.click("#connect");

  await page.waitForSelector("#connection-id:not(:empty)");
  const connectionId = await page.$eval("#connection-id", (el) => el.textContent);
  console.log(`connectionId=${connectionId}`);

  await page.waitForTimeout(3000);

  await page.click("#get-stats");

  await page.click("#disconnect");

  // simulcast sendonly 統計情報
  const sendonlyStatsReportJson = await getStatsReportJson(page);

  const sendonlyVideoCodecStats = findVideoCodecStats(sendonlyStatsReportJson, videoCodecType);
  expect(sendonlyVideoCodecStats).toBeDefined();

  const sendonlyVideoR0OutboundRtpStats = findOutboundRtpStatsByRid(
    sendonlyStatsReportJson,
    "video",
    "r0",
  );
  expect(sendonlyVideoR0OutboundRtpStats).toBeDefined();
  expect(sendonlyVideoR0OutboundRtpStats?.bytesSent).toBeGreaterThan(500);
  expect(sendonlyVideoR0OutboundRtpStats?.packetsSent).toBeGreaterThan(50);
  // 高さはエンコーダのアラインメントで 1 から 2 px 変動するため、幅だけ確認する
  expect(sendonlyVideoR0OutboundRtpStats?.frameWidth).toBe(400);

  const sendonlyVideoR1OutboundRtpStats = findOutboundRtpStatsByRid(
    sendonlyStatsReportJson,
    "video",
    "r1",
  );
  expect(sendonlyVideoR1OutboundRtpStats).toBeDefined();
  expect(sendonlyVideoR1OutboundRtpStats?.bytesSent).toBeGreaterThan(500);
  expect(sendonlyVideoR1OutboundRtpStats?.packetsSent).toBeGreaterThan(50);
  // r1 も同じ理由で幅だけ確認する
  expect(sendonlyVideoR1OutboundRtpStats?.frameWidth).toBe(800);

  const sendonlyVideoR2OutboundRtpStats = findOutboundRtpStatsByRid(
    sendonlyStatsReportJson,
    "video",
    "r2",
  );
  expect(sendonlyVideoR2OutboundRtpStats).toBeDefined();
  expect(sendonlyVideoR2OutboundRtpStats?.bytesSent).toBe(0);
  expect(sendonlyVideoR2OutboundRtpStats?.packetsSent).toBeLessThanOrEqual(1);

  await page.close();
});
