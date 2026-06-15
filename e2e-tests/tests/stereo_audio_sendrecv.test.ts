import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  checkSoraVersionFromWindow,
  countOpusStereo,
  findInboundRtpStats,
  findOutboundRtpStats,
  getAnalysisData,
  getOpusPayloadType,
  getStatsReportJson,
  hasOpusStereo,
  unsupportedVersionSkipReason,
  waitForStereoNegotiationData,
} from "./helper";
import type { StereoAudioSendRecvAnalysisData, StereoSendRecvNegotiationData } from "./helper";

// 各テストで try { ... } finally { await page.close(); } を使い、テスト失敗時にも
// page を確実に閉じて Playwright の retries: 3 下での page leak を防ぐ。
test.describe("Stereo Audio SendRecv Tests", () => {
  test.beforeEach(async ({ page, browser, browserName }) => {
    // ブラウザ情報をログ出力
    const browserVersion = browser.version();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    console.log(`Browser: ${browserName} ${browserVersion}`);
    console.log(`User Agent: ${userAgent}`);

    // ページに移動して Sora JS SDK のバージョンを確認
    await page.goto("http://localhost:9000/fake_stereo_audio_sendrecv/");

    const versionCheck = await checkSoraVersionFromWindow(page, {
      featureName: "Stereo Audio SendRecv",
      majorVersion: 2024,
      minorVersion: 2,
    });
    test.skip(!versionCheck.isSupported, unsupportedVersionSkipReason(versionCheck.skipReason));
  });

  test("stereo audio bidirectional transmission test", async ({ browser }) => {
    // 新しいページを作成
    const page = await browser.newPage();

    try {
      // ページに移動
      await page.goto("http://localhost:9000/fake_stereo_audio_sendrecv/");

      // チャネル名を uuid で生成する
      const channelName = randomUUID();

      await page.fill("#channel-name", channelName);

      // 両方の接続でステレオを有効にして接続する。
      // sendrecv 方向は addStereoToFmtp の isRecvOnly ゲートで弾かれるため、
      // #force-stereo-output-* は SDP 上 no-op になる。
      // HTML 初期値への暗黙依存を解消するため明示的に uncheck に統一する。
      await page.check("#use-stereo-1");
      await page.check("#use-stereo-2");
      await page.uncheck("#force-stereo-output-1");
      await page.uncheck("#force-stereo-output-2");
      await page.click("#connect");

      // 両方のconnection-idが表示されるまで待つ
      await page.waitForSelector("#connection-id-1:not(:empty)");
      await page.waitForSelector("#connection-id-2:not(:empty)");

      const connectionId1 = await page.$eval("#connection-id-1", (el) => el.textContent);
      const connectionId2 = await page.$eval("#connection-id-2", (el) => el.textContent);

      console.log(`connection-1 connectionId=${connectionId1}`);
      console.log(`connection-2 connectionId=${connectionId2}`);

      // レース対策
      await page.waitForTimeout(3000);

      // 'Get Stats' ボタンをクリックして統計情報を取得
      await page.click("#get-stats");
      // 統計情報が表示されるまで待機
      await page.waitForSelector("#stats-report-1");
      await page.waitForSelector("#stats-report-2");

      // 接続1の統計情報を取得
      const stats1Json = await getStatsReportJson(page, "#stats-report-1");
      const stats2Json = await getStatsReportJson(page, "#stats-report-2");

      // 接続1：音声が正常に送受信できているかを確認
      const conn1AudioOutboundRtp = findOutboundRtpStats(stats1Json, "audio");
      expect(conn1AudioOutboundRtp).toBeDefined();
      expect(conn1AudioOutboundRtp?.bytesSent).toBeGreaterThan(0);
      expect(conn1AudioOutboundRtp?.packetsSent).toBeGreaterThan(0);

      const conn1AudioInboundRtp = findInboundRtpStats(stats1Json, "audio");
      expect(conn1AudioInboundRtp).toBeDefined();
      expect(conn1AudioInboundRtp?.bytesReceived).toBeGreaterThan(0);
      expect(conn1AudioInboundRtp?.packetsReceived).toBeGreaterThan(0);

      // 接続2：音声が正常に送受信できているかを確認
      const conn2AudioOutboundRtp = findOutboundRtpStats(stats2Json, "audio");
      expect(conn2AudioOutboundRtp).toBeDefined();
      expect(conn2AudioOutboundRtp?.bytesSent).toBeGreaterThan(0);
      expect(conn2AudioOutboundRtp?.packetsSent).toBeGreaterThan(0);

      const conn2AudioInboundRtp = findInboundRtpStats(stats2Json, "audio");
      expect(conn2AudioInboundRtp).toBeDefined();
      expect(conn2AudioInboundRtp?.bytesReceived).toBeGreaterThan(0);
      expect(conn2AudioInboundRtp?.packetsReceived).toBeGreaterThan(0);

      const analysisData = await getAnalysisData<StereoAudioSendRecvAnalysisData>(page);

      console.log("Stereo sendrecv test - Audio analysis:", analysisData);

      // 接続1のローカル（送信側）のステレオ検証（440Hz基準）
      expect(analysisData.connection1.local.channelCount).toBeGreaterThanOrEqual(2);
      expect(analysisData.connection1.local.isStereo).toBe(true);
      expect(analysisData.connection1.local.leftFrequency).toBeGreaterThan(400);
      expect(analysisData.connection1.local.leftFrequency).toBeLessThan(480);
      expect(analysisData.connection1.local.rightFrequency).toBeGreaterThan(600);
      expect(analysisData.connection1.local.rightFrequency).toBeLessThan(700);

      // 接続1のリモート（接続2から受信）のステレオ検証（880Hz基準）
      expect(analysisData.connection1.remote.channelCount).toBeGreaterThanOrEqual(2);
      expect(analysisData.connection1.remote.isStereo).toBe(true);
      expect(analysisData.connection1.remote.leftFrequency).toBeGreaterThan(840);
      expect(analysisData.connection1.remote.leftFrequency).toBeLessThan(920);
      expect(analysisData.connection1.remote.rightFrequency).toBeGreaterThan(1200);
      expect(analysisData.connection1.remote.rightFrequency).toBeLessThan(1400);

      // 接続2のローカル（送信側）のステレオ検証（880Hz基準）
      expect(analysisData.connection2.local.channelCount).toBeGreaterThanOrEqual(2);
      expect(analysisData.connection2.local.isStereo).toBe(true);
      expect(analysisData.connection2.local.leftFrequency).toBeGreaterThan(840);
      expect(analysisData.connection2.local.leftFrequency).toBeLessThan(920);
      expect(analysisData.connection2.local.rightFrequency).toBeGreaterThan(1200);
      expect(analysisData.connection2.local.rightFrequency).toBeLessThan(1400);

      // 接続2のリモート（接続1から受信）のステレオ検証（440Hz基準）
      expect(analysisData.connection2.remote.channelCount).toBeGreaterThanOrEqual(2);
      expect(analysisData.connection2.remote.isStereo).toBe(true);
      expect(analysisData.connection2.remote.leftFrequency).toBeGreaterThan(400);
      expect(analysisData.connection2.remote.leftFrequency).toBeLessThan(480);
      expect(analysisData.connection2.remote.rightFrequency).toBeGreaterThan(600);
      expect(analysisData.connection2.remote.rightFrequency).toBeLessThan(700);

      // SDP 上で stereo ネゴが成立しているかを assert する。
      // sendrecv では Sora の offer に stereo パラメータが反映され、ブラウザの createAnswer が
      // answer SDP の opus fmtp に stereo=1 を保持することに依存する best-effort assert。
      const negotiation = await waitForStereoNegotiationData<StereoSendRecvNegotiationData>(page);

      expect(negotiation.conn1LocalSdp).not.toBe("");
      expect(negotiation.conn1LocalSdp).toMatch(/^v=0/u);
      expect(negotiation.conn2LocalSdp).not.toBe("");
      expect(negotiation.conn2LocalSdp).toMatch(/^v=0/u);

      const conn1Pt = getOpusPayloadType(negotiation.conn1LocalSdp);
      expect(conn1Pt).not.toBeNull();
      expect(countOpusStereo(negotiation.conn1LocalSdp, conn1Pt!)).toBe(1);

      const conn2Pt = getOpusPayloadType(negotiation.conn2LocalSdp);
      expect(conn2Pt).not.toBeNull();
      expect(countOpusStereo(negotiation.conn2LocalSdp, conn2Pt!)).toBe(1);

      await page.click("#disconnect");
    } finally {
      await page.close();
    }
  });

  test("mono audio bidirectional transmission test", async ({ browser }) => {
    // 新しいページを作成
    const page = await browser.newPage();

    try {
      // ページに移動
      await page.goto("http://localhost:9000/fake_stereo_audio_sendrecv/");

      // チャネル名を uuid で生成する
      const channelName = randomUUID();

      await page.fill("#channel-name", channelName);

      // 両方の接続でモノラルに設定して接続する。
      // 4 つの checkbox を明示的に uncheck することで HTML 初期値への暗黙依存を解消する。
      await page.uncheck("#use-stereo-1");
      await page.uncheck("#use-stereo-2");
      await page.uncheck("#force-stereo-output-1");
      await page.uncheck("#force-stereo-output-2");
      await page.click("#connect");

      // 両方のconnection-idが表示されるまで待つ
      await page.waitForSelector("#connection-id-1:not(:empty)");
      await page.waitForSelector("#connection-id-2:not(:empty)");

      const connectionId1 = await page.$eval("#connection-id-1", (el) => el.textContent);
      const connectionId2 = await page.$eval("#connection-id-2", (el) => el.textContent);

      console.log(`connection-1 connectionId=${connectionId1}`);
      console.log(`connection-2 connectionId=${connectionId2}`);

      // レース対策
      await page.waitForTimeout(3000);

      // 'Get Stats' ボタンをクリックして統計情報を取得
      await page.click("#get-stats");
      // 統計情報が表示されるまで待機
      await page.waitForSelector("#stats-report-1");
      await page.waitForSelector("#stats-report-2");

      // 音声分析結果を取得
      const analysisData = await getAnalysisData<StereoAudioSendRecvAnalysisData>(page);

      console.log("Mono sendrecv test - Audio analysis:", analysisData);

      // 接続1のローカル（送信側）のモノラル検証（440Hz基準）
      expect(analysisData.connection1.local.isStereo).toBe(false);
      expect(analysisData.connection1.local.leftFrequency).toBeGreaterThan(400);
      expect(analysisData.connection1.local.leftFrequency).toBeLessThan(480);
      expect(
        Math.abs(
          analysisData.connection1.local.leftFrequency -
            analysisData.connection1.local.rightFrequency,
        ),
      ).toBeLessThan(10);

      // 接続1のリモート（接続2から受信）のモノラル検証（880Hz基準）
      expect(analysisData.connection1.remote.isStereo).toBe(false);
      expect(analysisData.connection1.remote.leftFrequency).toBeGreaterThan(840);
      expect(analysisData.connection1.remote.leftFrequency).toBeLessThan(920);
      expect(
        Math.abs(
          analysisData.connection1.remote.leftFrequency -
            analysisData.connection1.remote.rightFrequency,
        ),
      ).toBeLessThan(10);

      // 接続2のローカル（送信側）のモノラル検証（880Hz基準）
      expect(analysisData.connection2.local.isStereo).toBe(false);
      expect(analysisData.connection2.local.leftFrequency).toBeGreaterThan(840);
      expect(analysisData.connection2.local.leftFrequency).toBeLessThan(920);
      expect(
        Math.abs(
          analysisData.connection2.local.leftFrequency -
            analysisData.connection2.local.rightFrequency,
        ),
      ).toBeLessThan(10);

      // 接続2のリモート（接続1から受信）のモノラル検証（440Hz基準）
      expect(analysisData.connection2.remote.isStereo).toBe(false);
      expect(analysisData.connection2.remote.leftFrequency).toBeGreaterThan(400);
      expect(analysisData.connection2.remote.leftFrequency).toBeLessThan(480);
      expect(
        Math.abs(
          analysisData.connection2.remote.leftFrequency -
            analysisData.connection2.remote.rightFrequency,
        ),
      ).toBeLessThan(10);

      // SDP 上で stereo ネゴが行われていないことを assert する。
      const negotiation = await waitForStereoNegotiationData<StereoSendRecvNegotiationData>(page);

      expect(negotiation.conn1LocalSdp).not.toBe("");
      expect(negotiation.conn1LocalSdp).toMatch(/^v=0/u);
      expect(negotiation.conn2LocalSdp).not.toBe("");
      expect(negotiation.conn2LocalSdp).toMatch(/^v=0/u);

      const conn1Pt = getOpusPayloadType(negotiation.conn1LocalSdp);
      expect(conn1Pt).not.toBeNull();
      expect(hasOpusStereo(negotiation.conn1LocalSdp, conn1Pt!)).toBe(false);

      const conn2Pt = getOpusPayloadType(negotiation.conn2LocalSdp);
      expect(conn2Pt).not.toBeNull();
      expect(hasOpusStereo(negotiation.conn2LocalSdp, conn2Pt!)).toBe(false);

      await page.click("#disconnect");
    } finally {
      await page.close();
    }
  });

  test("mixed stereo/mono bidirectional transmission test", async ({ browser }) => {
    // 新しいページを作成
    const page = await browser.newPage();

    try {
      // ページに移動
      await page.goto("http://localhost:9000/fake_stereo_audio_sendrecv/");

      // チャネル名を uuid で生成する
      const channelName = randomUUID();

      await page.fill("#channel-name", channelName);

      // 接続1はステレオ、接続2はモノラルに設定。
      // sendrecv 方向では #force-stereo-output-* は SDP 上 no-op のため両方 uncheck に統一する。
      await page.check("#use-stereo-1");
      await page.uncheck("#use-stereo-2");
      await page.uncheck("#force-stereo-output-1");
      await page.uncheck("#force-stereo-output-2");
      await page.click("#connect");

      // 両方のconnection-idが表示されるまで待つ
      await page.waitForSelector("#connection-id-1:not(:empty)");
      await page.waitForSelector("#connection-id-2:not(:empty)");

      // レース対策
      await page.waitForTimeout(3000);

      // 'Get Stats' ボタンをクリックして統計情報を取得
      await page.click("#get-stats");
      await page.waitForSelector("#stats-report-1");
      await page.waitForSelector("#stats-report-2");

      // 音声分析結果を取得
      const analysisData = await getAnalysisData<StereoAudioSendRecvAnalysisData>(page);

      console.log("Mixed stereo/mono test - Audio analysis:", analysisData);

      // 接続1のローカルはステレオ
      expect(analysisData.connection1.local.isStereo).toBe(true);

      // 接続1のリモート（接続2から受信）はモノラル
      expect(analysisData.connection1.remote.isStereo).toBe(false);

      // 接続2のローカルはモノラル
      expect(analysisData.connection2.local.isStereo).toBe(false);

      // 接続2のリモート（接続1から受信）はステレオ
      expect(analysisData.connection2.remote.isStereo).toBe(true);

      // SDP 上の stereo ネゴ:
      // - conn1 (useStereo=true): audioOpusParamsStereo 経由で answer SDP に stereo=1 が反映される想定。
      // - conn2 (useStereo=false): conn2 自身は audioOpusParamsStereo を送っていないため、
      //   Sora が conn2 の offer に stereo を載せないことを前提に「含まれない」を assert する。
      //   Sora が同一チャネルで他クライアント (conn1) の audioOpusParamsStereo に引きずられて
      //   conn2 の offer にも stereo を載せる場合はこの assert が fail する。fail 時は別 issue で
      //   「Sora の audioOpusParamsStereo のチャネル単位反映仕様確認」を起票して切り分ける。
      const negotiation = await waitForStereoNegotiationData<StereoSendRecvNegotiationData>(page);

      expect(negotiation.conn1LocalSdp).not.toBe("");
      expect(negotiation.conn1LocalSdp).toMatch(/^v=0/u);
      expect(negotiation.conn2LocalSdp).not.toBe("");
      expect(negotiation.conn2LocalSdp).toMatch(/^v=0/u);

      const conn1Pt = getOpusPayloadType(negotiation.conn1LocalSdp);
      expect(conn1Pt).not.toBeNull();
      expect(countOpusStereo(negotiation.conn1LocalSdp, conn1Pt!)).toBe(1);

      const conn2Pt = getOpusPayloadType(negotiation.conn2LocalSdp);
      expect(conn2Pt).not.toBeNull();
      expect(hasOpusStereo(negotiation.conn2LocalSdp, conn2Pt!)).toBe(false);

      await page.click("#disconnect");
    } finally {
      await page.close();
    }
  });
});
