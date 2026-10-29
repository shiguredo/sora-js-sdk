import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import {
  findCodecStats,
  findInboundRtpStats,
  findOutboundRtpStats,
  findOutboundRtpStatsByRid,
  getStatsReportJson,
  shouldSkipFirefoxTest,
} from "./helper";
import type { StatsReport } from "./helper";

const SENDRECV_FIREFOX_URL = "http://127.0.0.1:9000/sendrecv_firefox/";
const SIMULCAST_SENDONLY_FIREFOX_URL = "http://127.0.0.1:9000/simulcast_sendonly_firefox/";
const SIMULCAST_RECVONLY_URL = "http://127.0.0.1:9000/simulcast_recvonly/";

// Firefox のテストは macOS でのみ実行する
const SKIP_REASON = "Firefox かつ macOS でのみテストを行う";

// simulcast のソース幅 (e2e-tests/simulcast_sendonly_firefox/main.ts の fake media と揃える)
const SIMULCAST_SOURCE_WIDTH = 960;

// 全 rid を送出させるために必要な video_bit_rate
// 1500 では r2 に割り当てられる帯域が不足し、r2 が送出されないため 5000 を指定する
const SIMULCAST_VIDEO_BIT_RATE = 5000;

// simulcast encodings は Sora の authz の private claims として JSON で渡す。
// scalabilityMode と scaleResolutionDownTo は TypeScript の RTCRtpEncodingParameters に
// 含まれないことがあるため、simulcast encodings 用の型として拡張する
type SimulcastEncoding = RTCRtpEncodingParameters & {
  scalabilityMode?: string;
  scaleResolutionDownTo?: { maxHeight: number; maxWidth: number };
};

// 全 rid を active にした simulcast encodings
// scaleResolutionDownBy は 960x540 のソースに対して
// r0 = 240x135, r1 = 480x270, r2 = 960x540 になる値
const SIMULCAST_ENCODINGS_ALL_ACTIVE: SimulcastEncoding[] = [
  { active: true, rid: "r0", scalabilityMode: "L1T1", scaleResolutionDownBy: 4 },
  { active: true, rid: "r1", scalabilityMode: "L1T1", scaleResolutionDownBy: 2 },
  { active: true, rid: "r2", scalabilityMode: "L1T1", scaleResolutionDownBy: 1 },
];

// r2 だけを active: false にした simulcast encodings
const SIMULCAST_ENCODINGS_R2_INACTIVE: SimulcastEncoding[] = [
  { active: true, rid: "r0", scalabilityMode: "L1T1", scaleResolutionDownBy: 4 },
  { active: true, rid: "r1", scalabilityMode: "L1T1", scaleResolutionDownBy: 2 },
  { active: false, rid: "r2" },
];

// scaleResolutionDownTo を指定した simulcast encodings
// Sora の authz のスキーマでは maxWidth / maxHeight で指定する
// (width / height で指定すると Sora が INVALID-AUTHZ-VALUE として値を破棄する)
// r2 は active: false にして scaleResolutionDownTo を指定しない
// webkit.test.ts の同じテストと同じ値に揃えている
const SIMULCAST_ENCODINGS_SCALE_RESOLUTION_DOWN_TO: SimulcastEncoding[] = [
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
];

// Firefox で送受信できるビデオコーデックかどうか
// Playwright 版 Firefox は GMP プラグイン (OpenH264) の導入が必要なため H264 は対応しない
// H265 は Firefox が WebRTC で利用できない
// 利用できないコーデックは test.fail にして、利用できるようになったときに suite が fail して気づけるようにする
const VIDEO_CODEC_CASES: Array<{ codec: string; supported: boolean }> = [
  { codec: "VP8", supported: true },
  { codec: "VP9", supported: true },
  { codec: "AV1", supported: true },
  { codec: "H265", supported: false },
];

/**
 * 取得済みのページと context を解放する
 *
 * 生成の途中で失敗した場合でも、取得済みのリソースだけを解放できるようにする。
 */
async function releasePagesAndContexts(pages: Page[], contexts: BrowserContext[]): Promise<void> {
  // 接続状態に関わらず切断してからページと context を解放する
  // 読み込みに失敗したページでも待ち時間を抑えるため、切断のタイムアウトを短くする
  await Promise.allSettled(
    pages.map(async (page) => {
      await page.click("#disconnect", { timeout: 2_000 }).catch(() => {});
      await page.close();
    }),
  );
  // page の close が失敗しても、context は必ず解放する
  await Promise.allSettled(contexts.map((context) => context.close()));
}

/**
 * sendrecv_firefox のページを 2 つ接続し、両方の統計レポートを取得する
 *
 * 同じチャンネルに 2 接続することで、自分が送出した映像を相手から受信できる。
 * 送出と受信が安定するまで 5 秒待ってから統計レポートを取得する。
 */
async function runSendrecvFirefox(
  browser: Browser,
  videoCodecType: string,
): Promise<[StatsReport, StatsReport]> {
  // 生成の途中で失敗しても、取得済みのリソースを finally で解放できるようにする
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    const context1 = await browser.newContext();
    contexts.push(context1);
    const context2 = await browser.newContext();
    contexts.push(context2);
    const page1 = await context1.newPage();
    pages.push(page1);
    const page2 = await context2.newPage();
    pages.push(page2);
    const channelName = randomUUID();
    for (const page of [page1, page2]) {
      await page.goto(SENDRECV_FIREFOX_URL);
      await page.fill("#channel-name", channelName);
      // 検証対象のビデオコーデックを明示的に選択する
      await page.selectOption("#video-codec-type", videoCodecType);
    }
    await page1.click("#connect");
    await page2.click("#connect");
    await page1.waitForSelector("#connection-id:not(:empty)");
    await page2.waitForSelector("#connection-id:not(:empty)");
    // 相互に映像が届くまで待つ
    await page1.waitForTimeout(5000);
    await page2.waitForTimeout(5000);
    // 統計レポートを取得する
    await page1.click("#get-stats");
    await page2.click("#get-stats");
    await page1.waitForSelector("#stats-report");
    await page2.waitForSelector("#stats-report");
    return [await getStatsReportJson(page1), await getStatsReportJson(page2)];
  } finally {
    // 接続状態に関わらずページと context を解放する
    await releasePagesAndContexts(pages, contexts);
  }
}

/**
 * 1 接続分の統計レポートで、指定したビデオコーデックで送出と受信が行われていることを検証する
 */
function expectVideoCodecSendRecv(stats: StatsReport, videoCodecType: string, label: string): void {
  const videoCodecMimeType = `video/${videoCodecType}`;
  // 音声は Opus で送受信できていることを確認する
  expect(findCodecStats(stats, "audio/opus"), `${label}: audio/opus の codec 統計`).toBeDefined();
  // ビデオが指定したコーデックで送出されていることを確認する
  const outboundRtp = findOutboundRtpStats(stats, "video");
  expect(outboundRtp, `${label}: ビデオの outbound-rtp`).toBeDefined();
  // outbound-rtp の codecId から codec 統計を引き、指定したコーデックであることを確認する
  // codec 統計に存在するだけで実際は別のコーデックで送信している場合があるため
  const outboundCodecStats = stats.find(
    (stat) => stat.type === "codec" && stat.id === outboundRtp?.codecId,
  );
  expect(outboundCodecStats?.mimeType, `${label}: outbound-rtp の codec の mimeType`).toBe(
    videoCodecMimeType,
  );
  expect(outboundRtp?.bytesSent, `${label}: ビデオの bytesSent`).toBeGreaterThan(0);
  expect(outboundRtp?.packetsSent, `${label}: ビデオの packetsSent`).toBeGreaterThan(0);
  // 相手が送出したビデオを指定したコーデックで受信できていることを確認する
  const inboundRtp = findInboundRtpStats(stats, "video");
  expect(inboundRtp, `${label}: ビデオの inbound-rtp`).toBeDefined();
  // inbound-rtp の codecId から codec 統計を引き、指定したコーデックであることを確認する
  const inboundCodecStats = stats.find(
    (stat) => stat.type === "codec" && stat.id === inboundRtp?.codecId,
  );
  expect(inboundCodecStats?.mimeType, `${label}: inbound-rtp の codec の mimeType`).toBe(
    videoCodecMimeType,
  );
  expect(inboundRtp?.bytesReceived, `${label}: ビデオの bytesReceived`).toBeGreaterThan(0);
  expect(inboundRtp?.packetsReceived, `${label}: ビデオの packetsReceived`).toBeGreaterThan(0);
}

/**
 * simulcast_sendonly_firefox のページで、接続前の入力値を設定する
 */
async function prepareSimulcastSendonly(
  page: Page,
  channelName: string,
  encodings: SimulcastEncoding[],
): Promise<void> {
  await page.goto(SIMULCAST_SENDONLY_FIREFOX_URL);
  await page.fill("#channel-name", channelName);
  // コーデックは VP8 を明示的に選択する
  await page.selectOption("#video-codec-type", "VP8");
  // r2 まで送出させるために video_bit_rate を大きくする
  await page.fill("#video-bit-rate", String(SIMULCAST_VIDEO_BIT_RATE));
  // simulcast encodings は authz の private claims として渡される
  await page.fill("#simulcast-encodings", JSON.stringify(encodings));
}

/**
 * simulcast_sendonly_firefox のページで接続し、統計レポートを取得する
 */
async function connectAndGetSimulcastStats(
  page: Page,
  channelName: string,
  encodings: SimulcastEncoding[],
  waitMs: number,
): Promise<StatsReport> {
  await prepareSimulcastSendonly(page, channelName, encodings);
  await page.click("#connect");
  await page.waitForSelector("#connection-id:not(:empty)");
  // 全 rid の送出が安定するまで待つ
  await page.waitForTimeout(waitMs);
  await page.click("#get-stats");
  await page.waitForSelector("#stats-report");
  return getStatsReportJson(page);
}

test.describe("Firefox", () => {
  test.beforeEach(() => {
    test.skip(shouldSkipFirefoxTest(test.info().project.name), SKIP_REASON);
  });

  for (const { codec, supported } of VIDEO_CODEC_CASES) {
    // Firefox が未対応のコーデックは test.fail にする
    const registerTest = supported ? test : test.fail;
    registerTest(`Firefox sendrecv ${codec}`, async ({ browser }) => {
      console.log(`Firefox sendrecv コーデック: ${codec}`);
      const [page1Stats, page2Stats] = await runSendrecvFirefox(browser, codec);
      expectVideoCodecSendRecv(page1Stats, codec, "sendrecv1");
      expectVideoCodecSendRecv(page2Stats, codec, "sendrecv2");
    });
  }

  test("Firefox simulcast 全 rid active で r0 / r1 / r2 を送出し r1 を受信できる", async ({
    browser,
  }) => {
    const channelName = randomUUID();
    // 生成の途中で失敗しても、取得済みのリソースを finally で解放できるようにする
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    try {
      const sendonlyContext = await browser.newContext();
      contexts.push(sendonlyContext);
      const recvonlyContext = await browser.newContext();
      contexts.push(recvonlyContext);
      const sendonly = await sendonlyContext.newPage();
      pages.push(sendonly);
      const recvonly = await recvonlyContext.newPage();
      pages.push(recvonly);
      // sendonly 側を全 rid active で接続する
      await prepareSimulcastSendonly(sendonly, channelName, SIMULCAST_ENCODINGS_ALL_ACTIVE);
      await sendonly.click("#connect");
      await sendonly.waitForSelector("#connection-id:not(:empty)");
      const sendonlyConnectionId = await sendonly.$eval("#connection-id", (el) => el.textContent);
      console.log(`sendonly connectionId=${sendonlyConnectionId}`);

      // recvonly 側を同じチャンネルに r1 で接続する
      await recvonly.goto(SIMULCAST_RECVONLY_URL);
      await recvonly.fill("#channel-name", channelName);
      await recvonly.selectOption("#simulcast-rid", "r1");
      await recvonly.click("#connect");
      await recvonly.waitForSelector("#connection-id:not(:empty)");
      const recvonlyConnectionId = await recvonly.$eval("#connection-id", (el) => el.textContent);
      console.log(`recvonly connectionId=${recvonlyConnectionId}`);

      // 全 rid の送出と r1 の受信が安定するまで待つ
      await sendonly.waitForTimeout(10_000);

      await sendonly.click("#get-stats");
      await recvonly.click("#get-stats");
      await sendonly.waitForSelector("#stats-report");
      await recvonly.waitForSelector("#stats-report");
      const sendonlyStats = await getStatsReportJson(sendonly);
      const recvonlyStats = await getStatsReportJson(recvonly);

      // 送出側は VP8 でコードされ、r0 / r1 / r2 のすべてが送出されている
      expect(
        findCodecStats(sendonlyStats, "video/VP8"),
        "sendonly: video/VP8 の codec 統計",
      ).toBeDefined();
      for (const rid of ["r0", "r1", "r2"]) {
        const outboundRtp = findOutboundRtpStatsByRid(sendonlyStats, "video", rid);
        expect(outboundRtp, `sendonly: ${rid} の outbound-rtp`).toBeDefined();
        expect(outboundRtp?.bytesSent, `sendonly: ${rid} の bytesSent`).toBeGreaterThan(0);
        expect(outboundRtp?.packetsSent, `sendonly: ${rid} の packetsSent`).toBeGreaterThan(0);
      }

      // 受信側は r1 の映像を VP8 で受信できている
      const inboundRtp = findInboundRtpStats(recvonlyStats, "video");
      expect(inboundRtp, "recvonly: ビデオの inbound-rtp").toBeDefined();
      // inbound-rtp の codecId から codec 統計を引き、VP8 で受信していることを確認する
      const inboundCodecStats = recvonlyStats.find(
        (stat) => stat.type === "codec" && stat.id === inboundRtp?.codecId,
      );
      expect(inboundCodecStats?.mimeType, "recvonly: inbound-rtp の codec の mimeType").toBe(
        "video/VP8",
      );
      expect(inboundRtp?.bytesReceived, "recvonly: ビデオの bytesReceived").toBeGreaterThan(0);
      expect(inboundRtp?.packetsReceived, "recvonly: ビデオの packetsReceived").toBeGreaterThan(0);

      // 受信した解像度が送出側の r1 の解像度と一致する
      // undefined 同士の比較で通らないように、数値であることを先に確認する
      const r1OutboundRtp = findOutboundRtpStatsByRid(sendonlyStats, "video", "r1");
      const r1FrameWidth = r1OutboundRtp?.frameWidth;
      const r1FrameHeight = r1OutboundRtp?.frameHeight;
      const inboundFrameWidth = inboundRtp?.frameWidth;
      const inboundFrameHeight = inboundRtp?.frameHeight;
      expect(typeof r1FrameWidth, "sendonly: r1 の frameWidth の型").toBe("number");
      expect(typeof r1FrameHeight, "sendonly: r1 の frameHeight の型").toBe("number");
      expect(typeof inboundFrameWidth, "recvonly: r1 の frameWidth の型").toBe("number");
      expect(typeof inboundFrameHeight, "recvonly: r1 の frameHeight の型").toBe("number");
      expect(inboundFrameWidth, "recvonly: r1 の frameWidth").toBeGreaterThan(0);
      expect(inboundFrameHeight, "recvonly: r1 の frameHeight").toBeGreaterThan(0);
      expect(inboundFrameWidth, "recvonly: r1 の frameWidth").toBe(r1FrameWidth);
      expect(inboundFrameHeight, "recvonly: r1 の frameHeight").toBe(r1FrameHeight);
      // ソースは 960x540 で、r1 は scaleResolutionDownBy 2 なので 480x270 になる
      expect(inboundFrameWidth, "recvonly: r1 の frameWidth").toBe(SIMULCAST_SOURCE_WIDTH / 2);
    } finally {
      // 接続状態に関わらずページと context を解放する
      await releasePagesAndContexts(pages, contexts);
    }
  });

  test("Firefox simulcast r2 を active: false にすると r2 は送出されない", async ({ page }) => {
    const channelName = randomUUID();
    const stats = await connectAndGetSimulcastStats(
      page,
      channelName,
      SIMULCAST_ENCODINGS_R2_INACTIVE,
      8000,
    );

    expect(findCodecStats(stats, "video/VP8"), "sendonly: video/VP8 の codec 統計").toBeDefined();

    // r2 は outbound-rtp 自体は存在するが、active: false のため送出されない
    const r2OutboundRtp = findOutboundRtpStatsByRid(stats, "video", "r2");
    expect(r2OutboundRtp, "sendonly: r2 の outbound-rtp").toBeDefined();
    expect(r2OutboundRtp?.bytesSent, "sendonly: r2 の bytesSent").toBe(0);
    expect(r2OutboundRtp?.packetsSent, "sendonly: r2 の packetsSent").toBeLessThanOrEqual(1);

    // r0 / r1 は送出され続けている
    for (const rid of ["r0", "r1"]) {
      const outboundRtp = findOutboundRtpStatsByRid(stats, "video", rid);
      expect(outboundRtp, `sendonly: ${rid} の outbound-rtp`).toBeDefined();
      expect(outboundRtp?.bytesSent, `sendonly: ${rid} の bytesSent`).toBeGreaterThan(0);
      expect(outboundRtp?.packetsSent, `sendonly: ${rid} の packetsSent`).toBeGreaterThan(0);
    }
  });

  test("Firefox simulcast scaleResolutionDownBy が outbound-rtp の解像度に反映される", async ({
    page,
  }) => {
    const channelName = randomUUID();
    const stats = await connectAndGetSimulcastStats(
      page,
      channelName,
      SIMULCAST_ENCODINGS_ALL_ACTIVE,
      10_000,
    );

    // 960x540 のソースを scaleResolutionDownBy で縮小した解像度を確認する
    const expectedResolutions: Array<{ rid: string; scaleResolutionDownBy: number }> = [
      { rid: "r0", scaleResolutionDownBy: 4 },
      { rid: "r1", scaleResolutionDownBy: 2 },
      { rid: "r2", scaleResolutionDownBy: 1 },
    ];
    for (const { rid, scaleResolutionDownBy } of expectedResolutions) {
      const outboundRtp = findOutboundRtpStatsByRid(stats, "video", rid);
      expect(outboundRtp, `sendonly: ${rid} の outbound-rtp`).toBeDefined();
      // frameHeight はエンコーダのアラインメントで変動するため、frameWidth だけ確認する
      expect(outboundRtp?.frameWidth, `sendonly: ${rid} の frameWidth`).toBe(
        SIMULCAST_SOURCE_WIDTH / scaleResolutionDownBy,
      );
    }
  });

  // Firefox は scaleResolutionDownTo (Chrome 131 / Edge 131 以降のみ対応) を適用せず、
  // r0 / r1 をソース解像度のまま送出するため、このテストは fail する
  test.fail(
    "Firefox simulcast scaleResolutionDownTo が outbound-rtp の解像度に反映される",
    async ({ page }) => {
      const channelName = randomUUID();
      const stats = await connectAndGetSimulcastStats(
        page,
        channelName,
        SIMULCAST_ENCODINGS_SCALE_RESOLUTION_DOWN_TO,
        10_000,
      );

      const r0OutboundRtp = findOutboundRtpStatsByRid(stats, "video", "r0");
      expect(r0OutboundRtp, "sendonly: r0 の outbound-rtp").toBeDefined();
      expect(r0OutboundRtp?.bytesSent, "sendonly: r0 の bytesSent").toBeGreaterThan(0);
      // scaleResolutionDownTo では 960x540 のソースが 400x225 に縮小される
      // frameHeight はエンコーダのアラインメントで変動するため、frameWidth だけ確認する
      expect(r0OutboundRtp?.frameWidth, "sendonly: r0 の frameWidth").toBe(400);

      const r1OutboundRtp = findOutboundRtpStatsByRid(stats, "video", "r1");
      expect(r1OutboundRtp, "sendonly: r1 の outbound-rtp").toBeDefined();
      expect(r1OutboundRtp?.bytesSent, "sendonly: r1 の bytesSent").toBeGreaterThan(0);
      // 同様に 960x540 のソースが 800x450 に縮小される
      expect(r1OutboundRtp?.frameWidth, "sendonly: r1 の frameWidth").toBe(800);

      // r2 は active: false のため送出されない
      const r2OutboundRtp = findOutboundRtpStatsByRid(stats, "video", "r2");
      expect(r2OutboundRtp, "sendonly: r2 の outbound-rtp").toBeDefined();
      expect(r2OutboundRtp?.bytesSent, "sendonly: r2 の bytesSent").toBe(0);
      expect(r2OutboundRtp?.packetsSent, "sendonly: r2 の packetsSent").toBeLessThanOrEqual(1);
    },
  );

  // Firefox の outbound-rtp には scalabilityMode が含まれないため、このテストは fail する
  test.fail("Firefox simulcast scalabilityMode が outbound-rtp に反映される", async ({ page }) => {
    const channelName = randomUUID();
    const stats = await connectAndGetSimulcastStats(
      page,
      channelName,
      SIMULCAST_ENCODINGS_ALL_ACTIVE,
      8000,
    );

    const r0OutboundRtp = findOutboundRtpStatsByRid(stats, "video", "r0");
    expect(r0OutboundRtp, "sendonly: r0 の outbound-rtp").toBeDefined();
    expect(r0OutboundRtp?.scalabilityMode, "sendonly: r0 の scalabilityMode").toEqual("L1T1");
  });
});
