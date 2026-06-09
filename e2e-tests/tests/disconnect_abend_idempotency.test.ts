import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { checkSoraVersion, unsupportedVersionSkipReason } from "./helper";

// SoraConnection の private 内部 (soraDataChannels) に E2E 用にアクセスするための型
// ConnectionPublisher は private フィールドを持つため、テスト側ではこの最小型でキャストする
// 注意: SDK 内部 (src/base.ts の private field) の rename を検出できないため、SDK 側変更時は本型も更新すること
interface SoraConnectionForTest {
  disconnect: () => Promise<void>;
  soraDataChannels: Record<string, RTCDataChannel | undefined>;
}

// timeline event の data と disconnect callback の event の構造一致 assert に使うフィールド集合
interface SoraCloseEventFields {
  type?: string;
  code?: number;
  reason?: string;
  title?: string;
}

// fixture 側 (e2e-tests/data_channel_signaling_only/main.ts) が window へ露出する E2E 用フィールド
interface WindowForTest {
  soraConnection: SoraConnectionForTest;
  e2eLastTimelineEvent?: SoraCloseEventFields;
  e2eLastDisconnectEvent?: SoraCloseEventFields;
}

// バージョンチェックの共通定義
// switched callback の利用要件として 2025.2.0+ を最低要件にする
// (4 系統冪等化リファクタは本 issue 0030 で導入されるため、本 SDK ビルドの develop 以降が要件)
const VERSION_REQUIREMENT = {
  featureName: "shutdown idempotency",
  majorVersion: 2025,
  minorVersion: 2,
} as const;

// disconnectWaitTimeout を超える待機時間。シナリオ 3 の「2 秒間 count が 1 を保つ」安定確認に使う
const STABILITY_WAIT_MS = 2000;

test("並列 abend (全 DataChannel の onerror 同時発火) で disconnect callback が 1 回だけ発火し event 種別は abend になる", async ({
  browser,
  browserName,
}) => {
  // dispatchEvent(new Event("error")) で RTCDataChannel.onerror が同期発火する挙動は Chromium 想定
  // (RTCDataChannel.onerror が RTCErrorEvent を期待するブラウザでは無視される)
  test.skip(browserName !== "chromium", 'dispatchEvent(new Event("error")) は Chromium 想定');

  const page = await browser.newPage();
  await page.goto("http://localhost:9000/data_channel_signaling_only/");

  const versionCheck = await checkSoraVersion(page, VERSION_REQUIREMENT);
  test.skip(!versionCheck.isSupported, unsupportedVersionSkipReason(versionCheck.skipReason));
  console.log(`SDK バージョン: ${versionCheck.version}`);

  const channelName = randomUUID();
  await page.fill("#channel-name", channelName);
  await page.click("#connect");

  // 接続確立を待つ (connection-id が埋まる + switched-status が "switched" になる)
  await page.waitForSelector("#connection-id:not(:empty)");
  await page.waitForSelector("#switched-status:not(:empty)");

  // 全 DataChannel に同時に onerror を強制発火させる
  // 1 本目で abend() が起動し、最初の同期 chunk で shuttingDownPromise が代入される
  // 続く 2 / 3 / 4 つ目は runShutdownOnce の同期 read で shuttingDownPromise !== null を観測して弾かれる
  await page.evaluate(() => {
    const w = window as unknown as WindowForTest;
    for (const key of ["signaling", "notify", "push", "stats"]) {
      w.soraConnection.soraDataChannels[key]?.dispatchEvent(new Event("error"));
    }
  });

  // shuttingDownPromise の同期ガードにより count は 1 で固定される
  await expect(page.locator("#disconnect-count")).toHaveText("1", { timeout: 5000 });
  // dispatchEvent で onerror が発火していれば event 種別は abend になる
  await expect(page.locator("#disconnect-event-type")).toHaveText("abend");
  // event 種別が abend のとき reason は DATA-CHANNEL-ONERROR (src/base.ts の onDataChannel.onerror で渡される title)
  // 反映先は e2eLastDisconnectEvent の reason ではなく event.title だが、abend ではないことの方が回帰検出として重要
  // ここでは reason は asser しない (abend のとき reason は undefined のため #disconnect-event-reason は空文字)
  await expect(page.locator("#disconnect-event-reason")).toHaveText("");

  // disconnect lifecycle 安定確認: STABILITY_WAIT_MS の間、count が 1 を保つかを明示的に検証する
  // 遅延発火する 2 本目以降の callback (forceCloseDataChannels 経由の code: 4999 等) で count が 2 になる Red を検出する
  // 0032 整合のため page.waitForTimeout は使わず Node.js の setTimeout を直接 await する
  await new Promise<void>((resolve) => setTimeout(resolve, STABILITY_WAIT_MS));
  await expect(page.locator("#disconnect-count")).toHaveText("1");

  // timeline event と disconnect event の構造が一致するか (旧 src/base.ts:818 の event 二重生成バグの回帰検出)
  // page.evaluate の戻り値は Playwright が serialize するため、Event 派生の prototype getter (= type) は own property
  // として明示的に抜き出してから返す (そうしないと serialization で消えて type 比較が空虚化する)
  const compare = await page.evaluate(() => {
    const w = window as unknown as WindowForTest;
    // #disconnect-count === "1" の assert を通過した時点で両者は必ずセット済みのため non-null assertion で undefined 分岐を避ける
    const tl = w.e2eLastTimelineEvent!;
    const dc = w.e2eLastDisconnectEvent!;
    return {
      sameRef: tl === dc,
      timelineType: tl.type,
      timelineCode: tl.code,
      timelineReason: tl.reason,
      timelineTitle: tl.title,
      disconnectType: dc.type,
      disconnectCode: dc.code,
      disconnectReason: dc.reason,
      disconnectTitle: dc.title,
    };
  });

  // 参照同一性は Chromium で structuredClone (createTimelineEvent 内) が DataCloneError で catch される性質から成立する
  // 旧 src/base.ts:818 のバグ (callback と timeline で別 SoraCloseEvent インスタンスを生成) を hard に検出する本命の assert
  expect(compare.sameRef).toBe(true);

  // 構造一致 hard assert (type / code / reason / title すべて一致)
  expect(compare.timelineType).toBe(compare.disconnectType);
  expect(compare.timelineCode).toBe(compare.disconnectCode);
  expect(compare.timelineReason).toBe(compare.disconnectReason);
  expect(compare.timelineTitle).toBe(compare.disconnectTitle);

  await page.close();
});

test("normal disconnect 中に abend が割り込んでも disconnect callback が 1 回だけ発火する", async ({
  browser,
  browserName,
}) => {
  // dispatchEvent で RTCDataChannel.onerror を同期発火させる挙動は Chromium 想定
  test.skip(browserName !== "chromium", 'dispatchEvent(new Event("error")) は Chromium 想定');

  const page = await browser.newPage();
  await page.goto("http://localhost:9000/data_channel_signaling_only/");

  const versionCheck = await checkSoraVersion(page, VERSION_REQUIREMENT);
  test.skip(!versionCheck.isSupported, unsupportedVersionSkipReason(versionCheck.skipReason));
  console.log(`SDK バージョン: ${versionCheck.version}`);

  const channelName = randomUUID();
  await page.fill("#channel-name", channelName);
  await page.click("#connect");

  await page.waitForSelector("#connection-id:not(:empty)");
  await page.waitForSelector("#switched-status:not(:empty)");

  // disconnect() 呼び出しから return までは同期 chunk で shuttingDownPromise の代入が完了する
  // 直後の dispatchEvent で起動する 2 本目 abend は shuttingDownPromise ガードで弾かれる (= 「1 本目代入直後の割り込み」)
  // 注意: 実際には disconnect() の work() 内 disconnectDataChannel() が DC.onerror を置換するタイミングと dispatchEvent
  //       の発火タイミングが重なるため、2 本目 abend 自体が起動しない経路も含まれる。issue 0030 line 247 に明記の通り
  //       本テストの主担保はコードレビューであり、E2E 上は count = 1 のリグレッション検出冗長性のみを目的とする
  await page.evaluate(async () => {
    const w = window as unknown as WindowForTest;
    const p = w.soraConnection.disconnect();
    w.soraConnection.soraDataChannels.signaling?.dispatchEvent(new Event("error"));
    await p;
  });

  // event 種別は best-effort (タイミングで normal/abend どちらにもなりうるため assert しない)
  await expect(page.locator("#disconnect-count")).toHaveText("1", { timeout: 5000 });

  await page.close();
});

test("明示的並列 disconnect で disconnectWaitTimeout 経過後も disconnect callback が 1 回のまま (安定確認)", async ({
  browser,
}) => {
  // disconnectWaitTimeout を実 DC close 往復より短く設定して Red パス (timeout 経路 + 4999 経由) を意図的に踏ませる
  // ガードが壊れていれば 2 本目も work して count = 2 になり、本テストが検出する
  // 本テストは dispatchEvent を使わないためブラウザ非依存 (Chromium 限定 skip 不要)
  const page = await browser.newPage();
  await page.goto("http://localhost:9000/data_channel_signaling_only/?disconnectWaitTimeout=1000");

  const versionCheck = await checkSoraVersion(page, VERSION_REQUIREMENT);
  test.skip(!versionCheck.isSupported, unsupportedVersionSkipReason(versionCheck.skipReason));
  console.log(`SDK バージョン: ${versionCheck.version}`);

  const channelName = randomUUID();
  await page.fill("#channel-name", channelName);
  await page.click("#connect");

  await page.waitForSelector("#connection-id:not(:empty)");
  await page.waitForSelector("#switched-status:not(:empty)");

  // 明示的並列 disconnect。runShutdownOnce の同期 if (shuttingDownPromise) return ... で
  // 2 本目は 1 本目と同一の Promise を return するため work() は 1 回しか走らない (closed/0002 機構 1 の回帰検出)
  await page.evaluate(async () => {
    const w = window as unknown as WindowForTest;
    await Promise.all([w.soraConnection.disconnect(), w.soraConnection.disconnect()]);
  });

  // 一旦 count が 1 を通過することを確認する
  await expect(page.locator("#disconnect-count")).toHaveText("1", { timeout: 5000 });

  // 安定確認: disconnectWaitTimeout (1000ms) を超える STABILITY_WAIT_MS (2000ms) の間、count が 1 を保つ
  // ガードが壊れていると遅延発火する 2 回目 callback (forceCloseDataChannels 経由の code: 4999) で count が 2 になる
  // expect.poll は「matcher が pass するまで」poll するため early exit する仕様で「保つ」検証にならない
  // 0032 整合のため page.waitForTimeout は使わず、Node.js の setTimeout を直接 await する
  await new Promise<void>((resolve) => setTimeout(resolve, STABILITY_WAIT_MS));
  await expect(page.locator("#disconnect-count")).toHaveText("1");

  await page.close();
});
