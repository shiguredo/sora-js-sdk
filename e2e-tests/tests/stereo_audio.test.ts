import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  checkSoraVersionFromWindow,
  countOpusStereo,
  findInboundRtpStats,
  findOutboundRtpStats,
  getAnalysisData,
  getOpusPayloadType,
  getRecvStatsReportJson,
  getStatsReportJson,
  hasOpusMinptime,
  hasOpusStereo,
  unsupportedVersionSkipReason,
  waitForStereoNegotiationData,
} from "./helper";
import type { StereoAudioAnalysisData, StereoNegotiationData } from "./helper";

// 各テストで try { ... } finally { await page.close(); } を使い、テスト失敗時にも
// page を確実に閉じて Playwright の retries: 3 下での page leak を防ぐ。
test.describe("Stereo Audio Tests", () => {
  test.beforeEach(async ({ page, browser, browserName }) => {
    // ブラウザ情報をログ出力
    const browserVersion = browser.version();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    console.log(`Browser: ${browserName} ${browserVersion}`);
    console.log(`User Agent: ${userAgent}`);

    // ページに移動して Sora JS SDK のバージョンを確認
    await page.goto("http://localhost:9000/fake_stereo_audio/");

    const versionCheck = await checkSoraVersionFromWindow(page, {
      featureName: "Stereo Audio",
      majorVersion: 2024,
      minorVersion: 2,
    });
    test.skip(!versionCheck.isSupported, unsupportedVersionSkipReason(versionCheck.skipReason));
  });

  test("stereo audio transmission test", async ({ browser }) => {
    // 新しいページを作成
    const page = await browser.newPage();

    try {
      // ページに移動
      await page.goto("http://localhost:9000/fake_stereo_audio/");

      // チャネル名を uuid で生成する
      const channelName = randomUUID();

      await page.fill("#channel-name", channelName);

      // ステレオを有効にして接続する。
      // #force-stereo-output は HTML 初期値 checked への暗黙依存を解消するため
      // テスト側からも明示的に check する。
      await page.check("#use-stereo");
      await page.check("#force-stereo-output");
      await page.click("#connect");

      // 両方のconnection-idが表示されるまで待つ
      await page.waitForSelector("#sendonly-connection-id:not(:empty)");
      await page.waitForSelector("#recvonly-connection-id:not(:empty)");

      const sendonlyConnectionId = await page.$eval(
        "#sendonly-connection-id",
        (el) => el.textContent,
      );
      const recvonlyConnectionId = await page.$eval(
        "#recvonly-connection-id",
        (el) => el.textContent,
      );

      console.log(`sendonly connectionId=${sendonlyConnectionId}`);
      console.log(`recvonly connectionId=${recvonlyConnectionId}`);

      // レース対策
      await page.waitForTimeout(3000);

      // 'Get Stats' ボタンをクリックして統計情報を取得
      await page.click("#get-stats");
      // 統計情報が表示されるまで待機
      await page.waitForSelector("#stats-report");

      // 送信側の統計情報を取得
      const sendStatsReportJson = await getStatsReportJson(page);
      const recvStatsReportJson = await getRecvStatsReportJson(page);

      // 送信側：音声が正常に送れているかを確認
      const sendAudioOutboundRtp = findOutboundRtpStats(sendStatsReportJson, "audio");
      expect(sendAudioOutboundRtp).toBeDefined();
      expect(sendAudioOutboundRtp?.bytesSent).toBeGreaterThan(0);
      expect(sendAudioOutboundRtp?.packetsSent).toBeGreaterThan(0);

      // 受信側：音声が正常に受信できているかを確認
      const recvAudioInboundRtp = findInboundRtpStats(recvStatsReportJson, "audio");
      expect(recvAudioInboundRtp).toBeDefined();
      expect(recvAudioInboundRtp?.bytesReceived).toBeGreaterThan(0);
      expect(recvAudioInboundRtp?.packetsReceived).toBeGreaterThan(0);

      const analysisData = await getAnalysisData<StereoAudioAnalysisData>(page);

      console.log("Stereo test - Audio analysis:", analysisData);

      // ローカル（送信側）のステレオ検証
      expect(analysisData.local.channelCount).toBeGreaterThanOrEqual(2);
      expect(analysisData.local.isStereo).toBe(true);
      expect(analysisData.local.leftFrequency).toBeGreaterThan(400);
      expect(analysisData.local.leftFrequency).toBeLessThan(480);
      expect(analysisData.local.rightFrequency).toBeGreaterThan(600);
      expect(analysisData.local.rightFrequency).toBeLessThan(700);

      // リモート（受信側）のステレオ検証
      expect(analysisData.remote.channelCount).toBeGreaterThanOrEqual(2);
      expect(analysisData.remote.isStereo).toBe(true);
      expect(analysisData.remote.leftFrequency).toBeGreaterThan(400);
      expect(analysisData.remote.leftFrequency).toBeLessThan(480);
      expect(analysisData.remote.rightFrequency).toBeGreaterThan(600);
      expect(analysisData.remote.rightFrequency).toBeLessThan(700);

      // SDP 上で stereo ネゴが成立しているかを assert する。
      // 送信経路 (sendonly publisher) は audioOpusParamsStereo 経由で signaling に乗り、
      // ブラウザの createAnswer が answer SDP の opus fmtp に stereo=1 を反映する想定。
      // 受信経路 (recvonly subscriber + forceStereoOutput) は SDK の addStereoToFmtp で
      // recv answer SDP の opus fmtp に stereo=1 を直接追加する。
      const negotiation = await waitForStereoNegotiationData<StereoNegotiationData>(page);
      console.log("Stereo test - SDP negotiation:", {
        sendOpusCodec: negotiation.sendOpusCodec,
      });

      // SDP 取得自体の成立を先に確認する。null 由来の空文字フォールバックと
      // 文字列だが SDP として不正のケースを分けて明示 fail させる。
      expect(negotiation.sendLocalSdp).not.toBe("");
      expect(negotiation.sendLocalSdp).toMatch(/^v=0/u);
      expect(negotiation.recvLocalSdp).not.toBe("");
      expect(negotiation.recvLocalSdp).toMatch(/^v=0/u);

      const sendPt = getOpusPayloadType(negotiation.sendLocalSdp);
      expect(sendPt).not.toBeNull();
      // 送信ネゴが 1 回だけ付与されること (冪等ガードが壊れて二重付与される回帰も検知する)
      expect(countOpusStereo(negotiation.sendLocalSdp, sendPt!)).toBe(1);

      const recvPt = getOpusPayloadType(negotiation.recvLocalSdp);
      expect(recvPt).not.toBeNull();
      // recv answer に opus minptime があるときのみ addStereoToFmtp の起動条件が成立する。
      // Sora の offer に minptime が反映されるかはブラウザ依存のため、minptime 不在なら
      // assert を緩めて annotation と console.log で記録する。
      if (hasOpusMinptime(negotiation.recvLocalSdp, recvPt!)) {
        expect(countOpusStereo(negotiation.recvLocalSdp, recvPt!)).toBe(1);
      } else {
        test.info().annotations.push({
          type: "recv-minptime-absent",
          description: "recv minptime が answer SDP に無いため stereo=1 assert を緩めた",
        });
        // list reporter でも目視可能にするため console.log を併用する。
        // annotation は list reporter では標準では表示されない。
        console.log(
          "[recv-minptime-absent] recv minptime が answer SDP に無いため stereo=1 assert を緩めた",
        );
        console.log("recvLocalSdp:", negotiation.recvLocalSdp);
        console.log("sendOpusCodec:", negotiation.sendOpusCodec);
      }

      await page.click("#disconnect");
    } finally {
      await page.close();
    }
  });

  test("mono audio transmission test", async ({ browser }) => {
    // 新しいページを作成
    const page = await browser.newPage();

    try {
      // ページに移動
      await page.goto("http://localhost:9000/fake_stereo_audio/");

      // チャネル名を uuid で生成する
      const channelName = randomUUID();

      await page.fill("#channel-name", channelName);

      // モノラルに設定して接続する。
      // #use-stereo / #force-stereo-output いずれも明示的に uncheck することで
      // HTML 初期値への暗黙依存を解消する。
      await page.uncheck("#use-stereo");
      await page.uncheck("#force-stereo-output");
      await page.click("#connect");

      // 両方のconnection-idが表示されるまで待つ
      await page.waitForSelector("#sendonly-connection-id:not(:empty)");
      await page.waitForSelector("#recvonly-connection-id:not(:empty)");

      const sendonlyConnectionId = await page.$eval(
        "#sendonly-connection-id",
        (el) => el.textContent,
      );
      const recvonlyConnectionId = await page.$eval(
        "#recvonly-connection-id",
        (el) => el.textContent,
      );

      console.log(`sendonly connectionId=${sendonlyConnectionId}`);
      console.log(`recvonly connectionId=${recvonlyConnectionId}`);

      // レース対策
      await page.waitForTimeout(3000);

      // 'Get Stats' ボタンをクリックして統計情報を取得
      await page.click("#get-stats");
      // 統計情報が表示されるまで待機
      await page.waitForSelector("#stats-report");

      // 送信側の統計情報を取得
      const sendStatsReportJson = await getStatsReportJson(page);

      // 音声が正常に送れているかを確認
      const sendAudioOutboundRtp = findOutboundRtpStats(sendStatsReportJson, "audio");
      expect(sendAudioOutboundRtp).toBeDefined();
      expect(sendAudioOutboundRtp?.bytesSent).toBeGreaterThan(0);
      expect(sendAudioOutboundRtp?.packetsSent).toBeGreaterThan(0);

      const analysisData = await getAnalysisData<StereoAudioAnalysisData>(page);

      console.log("Mono test - Audio analysis:", analysisData);

      // ローカル（送信側）のモノラル検証
      expect(analysisData.local.isStereo).toBe(false);
      expect(analysisData.local.leftFrequency).toBeGreaterThan(400);
      expect(analysisData.local.leftFrequency).toBeLessThan(480);
      expect(
        Math.abs(analysisData.local.leftFrequency - analysisData.local.rightFrequency),
      ).toBeLessThan(10);

      // リモート（受信側）のモノラル検証
      expect(analysisData.remote.isStereo).toBe(false);
      expect(analysisData.remote.leftFrequency).toBeGreaterThan(400);
      expect(analysisData.remote.leftFrequency).toBeLessThan(480);
      expect(
        Math.abs(analysisData.remote.leftFrequency - analysisData.remote.rightFrequency),
      ).toBeLessThan(10);

      // SDP 上で stereo ネゴが行われていないことを assert する。
      // mono は audioOpusParamsStereo / forceStereoOutput いずれも未設定で、
      // 送信 / 受信どちらの answer SDP にも stereo=1 が現れない想定。
      const negotiation = await waitForStereoNegotiationData<StereoNegotiationData>(page);

      expect(negotiation.sendLocalSdp).not.toBe("");
      expect(negotiation.sendLocalSdp).toMatch(/^v=0/u);
      expect(negotiation.recvLocalSdp).not.toBe("");
      expect(negotiation.recvLocalSdp).toMatch(/^v=0/u);

      const sendPt = getOpusPayloadType(negotiation.sendLocalSdp);
      expect(sendPt).not.toBeNull();
      expect(hasOpusStereo(negotiation.sendLocalSdp, sendPt!)).toBe(false);

      const recvPt = getOpusPayloadType(negotiation.recvLocalSdp);
      expect(recvPt).not.toBeNull();
      expect(hasOpusStereo(negotiation.recvLocalSdp, recvPt!)).toBe(false);

      await page.click("#disconnect");
    } finally {
      await page.close();
    }
  });
});
