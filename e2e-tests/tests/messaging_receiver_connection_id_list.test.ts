import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import {
  checkSoraVersion,
  unsupportedVersionSkipReason,
  filterDataChannelStats,
  findDataChannelStats,
  getStatsReportJson,
} from "./helper";
import type { StatsReport } from "./helper";

// DataChannel メッセージングの宛先ヘッダー (header の type receiver_connection_id_list) の E2E テスト
//
// - receiver_connection_id_list を宣言したラベルでは、sendMessageToReceivers で指定した connection_id の
//   接続にだけメッセージが届き、受信者に届くメッセージには宛先ヘッダーは含まれない
// - 宣言の有無と送信メソッドが合わない場合は、送信前に例外になる
//
// この機能に対応した Sora が接続先であることを前提にする。

const MESSAGING_URL = "http://localhost:9000/messaging/";

// メッセージングに使う DataChannel のラベル (メッセージングの E2E ページで固定している)
const MESSAGING_LABEL = "#example";

// DataChannel が open するまで待つ時間
const DATA_CHANNEL_OPEN_TIMEOUT = 10_000;

// #get-stats を押した回の統計が書き込まれるまで待つ時間
const STATS_RESPONSE_TIMEOUT = 5000;

interface MessagingPage {
  context: BrowserContext;
  page: Page;
}

interface ConnectOptions {
  // dataChannels の compress
  compress: boolean;
  // header に receiver_connection_id_list を宣言するかどうか
  declareReceiverConnectionIdList: boolean;
}

type DataChannelStats = Record<string, unknown>;

// 新しいブラウザコンテキストで messaging ページを開く
const openMessagingPage = async (browser: Browser): Promise<MessagingPage> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(MESSAGING_URL);
  return { context, page };
};

// sora-js-sdk が receiver_connection_id_list に対応したバージョンでなければテストをスキップする
const skipIfUnsupportedVersion = async (page: Page): Promise<void> => {
  const versionCheck = await checkSoraVersion(page, {
    featureName: "Messaging with receiver_connection_id_list",
    majorVersion: 2026,
    minorVersion: 2,
  });
  test.skip(!versionCheck.isSupported, unsupportedVersionSkipReason(versionCheck.skipReason));
};

// チャンネル名と DataChannel の設定を入力して接続し、自身の connection_id を返す
const connectMessagingPage = async (
  page: Page,
  channelName: string,
  options: ConnectOptions,
): Promise<string> => {
  await page.fill("#channel-name", channelName);
  await page.setChecked("#check-compress", options.compress);
  await page.setChecked(
    "#check-receiver-connection-id-list",
    options.declareReceiverConnectionIdList,
  );
  await page.click("#connect");
  // connection.created を受け取ると connection_id が表示される
  await page.waitForSelector("#connection-id:not(:empty)");
  const connectionId = await page.$eval("#connection-id", (element) => element.textContent);
  return connectionId ?? "";
};

// #get-stats を押して統計を取り直し、押した回の統計を返す
//
// getStats は非同期なので、押した直後に読むと前に押したときの統計を読んでしまう。
// メッセージングの E2E ページは押した回の統計を書き込むと、何回目かを data-stats-response-id に残すので、
// 押す前に残っている番号に 1 を足した回の統計が書き込まれるまで待ってから読む。
// 前に押した回の統計はすべて書き込み済みであることを前提にする (この関数は毎回書き込みまで待つ)。
const fetchStatsReportJson = async (page: Page): Promise<StatsReport> => {
  const previousResponseId = await page.$eval(
    "#stats-report",
    (element) => element.dataset.statsResponseId ?? "0",
  );
  const requestId = Number(previousResponseId) + 1;
  await page.click("#get-stats");
  await page.waitForSelector(`#stats-report[data-stats-response-id="${requestId}"]`, {
    state: "attached",
    timeout: STATS_RESPONSE_TIMEOUT,
  });
  return getStatsReportJson(page);
};

// メッセージング用の DataChannel が open するまで統計を取り直し、open の統計を返す
//
// datachannel コールバック (#messaging li) は DataChannel が open する前に発火することがあるため、
// open したことは統計の state で確かめる。
const waitForOpenMessagingDataChannelStats = async (page: Page): Promise<DataChannelStats> => {
  const timeoutMessage = `${MESSAGING_LABEL} の DataChannel が open にならない`;
  let openStats: DataChannelStats | undefined;
  await expect
    .poll(
      async () => {
        const statsReportJson = await fetchStatsReportJson(page);
        const dataChannelStats = filterDataChannelStats(statsReportJson);
        openStats = findDataChannelStats(dataChannelStats, MESSAGING_LABEL, "open");
        return openStats !== undefined;
      },
      { message: timeoutMessage, timeout: DATA_CHANNEL_OPEN_TIMEOUT },
    )
    .toBe(true);
  // poll が成功した時点で openStats には open の統計が入っている。型を絞り込むために確かめる
  if (openStats === undefined) {
    throw new Error(timeoutMessage);
  }
  return openStats;
};

// 宛先の connection_id を指定してメッセージを送信する
const sendMessageToReceivers = async (
  page: Page,
  message: string,
  receiverConnectionIds: string[],
): Promise<void> => {
  await page.fill('input[name="message"]', message);
  await page.fill("#receiver-connection-ids", receiverConnectionIds.join(","));
  await page.click("#send-message-to-receivers");
};

// 最初に受信したメッセージを返す
const getFirstReceivedMessage = async (page: Page): Promise<string | null> => {
  await page.waitForSelector("#received-messages li", { state: "attached" });
  return page.$eval("#received-messages li", (element) => element.textContent);
};

// 切断してページとブラウザコンテキストを閉じる
const closeMessagingPages = async (messagingPages: MessagingPage[]): Promise<void> => {
  for (const { page } of messagingPages) {
    await page.click("#disconnect");
  }
  for (const { context, page } of messagingPages) {
    await page.close();
    await context.close();
  }
};

// compress が false の場合と true の場合の両方で、宛先指定が効くことを確かめる
// #connection-id は切断しても消えないため、同じページで接続し直すと前の接続の connection_id を
// 読んでしまう。項目ごとに新しいページで接続する
for (const compress of [false, true]) {
  test(`receiver_connection_id_list で指定した宛先にだけメッセージが届く (compress: ${compress})`, async ({
    browser,
  }) => {
    // スキップする場合に使わないページを開かないよう、1 つ目のページでバージョンを確かめてから残りを開く
    const messagingPage1 = await openMessagingPage(browser);
    const { page: page1 } = messagingPage1;
    await skipIfUnsupportedVersion(page1);

    // 3 つの独立したブラウザコンテキストを使う
    const messagingPage2 = await openMessagingPage(browser);
    const messagingPage3 = await openMessagingPage(browser);
    const { page: page2 } = messagingPage2;
    const { page: page3 } = messagingPage3;

    // チャンネル名を uuid 文字列にする
    const channelName = randomUUID();

    // 3 ページとも receiver_connection_id_list を宣言して接続する
    const connectOptions: ConnectOptions = { compress, declareReceiverConnectionIdList: true };
    const page1ConnectionId = await connectMessagingPage(page1, channelName, connectOptions);
    const page2ConnectionId = await connectMessagingPage(page2, channelName, connectOptions);
    const page3ConnectionId = await connectMessagingPage(page3, channelName, connectOptions);
    console.log(`page1 の connection_id: ${page1ConnectionId}`);
    console.log(`page2 の connection_id: ${page2ConnectionId}`);
    console.log(`page3 の connection_id: ${page3ConnectionId}`);

    // 3 ページすべてのメッセージング用 DataChannel が open してから送る
    await waitForOpenMessagingDataChannelStats(page1);
    await waitForOpenMessagingDataChannelStats(page2);
    await waitForOpenMessagingDataChannelStats(page3);

    // page1 から page2 だけを宛先にして送る
    const messageToPage2 = `to page2 (compress: ${compress})`;
    await sendMessageToReceivers(page1, messageToPage2, [page2ConnectionId]);

    // page2 が受け取ったメッセージは送ったものと一致し、宛先ヘッダーは含まれない
    const page2ReceivedMessage = await getFirstReceivedMessage(page2);
    console.log(`page2 が受信したメッセージ: ${page2ReceivedMessage}`);
    expect(page2ReceivedMessage).toBe(messageToPage2);

    // page3 が page2 宛てのメッセージを受け取っていないことを確かめるため、
    // 続けて page3 を宛先にした区切りのメッセージを送る
    // page3 が最初に受け取ったのが区切りのメッセージであれば、page2 宛てのメッセージは届いていない
    // この確かめ方は、同じ送信者が同じラベルで送ったメッセージが送った順に受信者へ届くことを前提にしている
    // この前提は公開ドキュメントには書かれていない。前提が崩れると、このテストは失敗ではなく
    // 誤って合格する方向にずれる
    const delimiterMessage = `delimiter to page3 (compress: ${compress})`;
    await sendMessageToReceivers(page1, delimiterMessage, [page3ConnectionId]);

    const page3ReceivedMessage = await getFirstReceivedMessage(page3);
    console.log(`page3 が最初に受信したメッセージ: ${page3ReceivedMessage}`);
    expect(page3ReceivedMessage).toBe(delimiterMessage);

    await closeMessagingPages([messagingPage1, messagingPage2, messagingPage3]);
  });
}

// 宣言の有無と送信メソッドが合わない場合は、送信前に例外になることを確かめる
test("receiver_connection_id_list の宣言と送信メソッドが合わない場合は送信前に例外になる", async ({
  browser,
}) => {
  // スキップする場合に使わないページを開かないよう、1 つ目のページでバージョンを確かめてから残りを開く
  const declaredMessagingPage = await openMessagingPage(browser);
  const { page: declaredPage } = declaredMessagingPage;
  await skipIfUnsupportedVersion(declaredPage);

  // 2 つの独立したブラウザコンテキストを使う
  const undeclaredMessagingPage = await openMessagingPage(browser);
  const { page: undeclaredPage } = undeclaredMessagingPage;

  // チャンネル名を uuid 文字列にする
  const channelName = randomUUID();

  // declaredPage だけ receiver_connection_id_list を宣言して接続する
  const declaredConnectionId = await connectMessagingPage(declaredPage, channelName, {
    compress: false,
    declareReceiverConnectionIdList: true,
  });
  const undeclaredConnectionId = await connectMessagingPage(undeclaredPage, channelName, {
    compress: false,
    declareReceiverConnectionIdList: false,
  });
  console.log(`declaredPage の connection_id: ${declaredConnectionId}`);
  console.log(`undeclaredPage の connection_id: ${undeclaredConnectionId}`);

  // DataChannel が open していない場合の例外と区別するため、open してから送る
  await waitForOpenMessagingDataChannelStats(declaredPage);
  await waitForOpenMessagingDataChannelStats(undeclaredPage);

  // receiver_connection_id_list を宣言したラベルで sendMessage を呼ぶと例外になる
  await declaredPage.fill('input[name="message"]', "sendMessage on declared label");
  await declaredPage.click("#send-message");
  await expect(declaredPage.locator("#send-message-error")).toContainText(
    "Cannot send message without receivers on DataChannel declaring receiver_connection_id_list header",
  );
  await expect(declaredPage.locator("#send-message-error")).toContainText(
    "use sendMessageToReceivers instead",
  );

  // receiver_connection_id_list を宣言していないラベルで sendMessageToReceivers を呼ぶと例外になる
  await sendMessageToReceivers(undeclaredPage, "sendMessageToReceivers on undeclared label", [
    declaredConnectionId,
  ]);
  await expect(undeclaredPage.locator("#send-message-error")).toContainText(
    "DataChannel does not declare receiver_connection_id_list header",
  );
  await expect(undeclaredPage.locator("#send-message-error")).toContainText(
    "use sendMessage instead",
  );

  // 送信前に例外になっていれば、どちらのページも DataChannel でメッセージを送っていない
  // 例外の後に押した回の統計を取り直し、messagesSent (送ったメッセージの累計) が 0 であることを確かめる
  const declaredStatsAfter = await waitForOpenMessagingDataChannelStats(declaredPage);
  const undeclaredStatsAfter = await waitForOpenMessagingDataChannelStats(undeclaredPage);
  console.log(`declaredPage の例外後の messagesSent: ${String(declaredStatsAfter.messagesSent)}`);
  console.log(
    `undeclaredPage の例外後の messagesSent: ${String(undeclaredStatsAfter.messagesSent)}`,
  );
  expect(declaredStatsAfter.messagesSent).toBe(0);
  expect(undeclaredStatsAfter.messagesSent).toBe(0);

  await closeMessagingPages([declaredMessagingPage, undeclaredMessagingPage]);
});
