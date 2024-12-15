import { expect, test } from '@playwright/test'
import { isVersionGreaterThanOrEqual } from './helper'

test('messaging pages with header', async ({ browser }) => {
  // 新しいページを2つ作成
  const page1 = await browser.newPage()
  const page2 = await browser.newPage()

  // それぞれのページに対して操作を行う
  await page1.goto('http://localhost:9000/messaging/')
  await page2.goto('http://localhost:9000/messaging/')

  // sora js sdk のバージョンを取得する
  await page1.waitForSelector('#sora-js-sdk-version')
  const page1SoraJsSdkVersion = await page1.$eval('#sora-js-sdk-version', (el) => el.textContent)
  if (page1SoraJsSdkVersion === null) {
    throw new Error('page1SoraJsSdkVersion is null')
  }
  // sora-js-sdk のバージョンが 2024.2.0 以上であるか確認して、2024.2.0 未満の場合はテストをスキップする
  test.skip(
    !isVersionGreaterThanOrEqual(page1SoraJsSdkVersion, '2024.2.0'),
    'sora-js-sdk のバージョンが 2024.2.0 以上である必要があります',
  )

  // チャネル名を設定する
  await page1.fill('input[name="channel-name"]', 'message-header')
  await page2.fill('input[name="channel-name"]', 'message-header')

  // header を有効にする
  await page1.check('#check-header')
  await page2.check('#check-header')

  // connect ボタンを押して接続開始
  await page1.click('#connect')
  await page2.click('#connect')

  await page1.waitForSelector('#connection-id:not(:empty)')
  const page1ConnectionId = await page1.$eval('#connection-id', (el) => el.textContent)
  console.log(`page1 connectionId=${page1ConnectionId}`)

  await page2.waitForSelector('#connection-id:not(:empty)')
  const page2ConnectionId = await page2.$eval('#connection-id', (el) => el.textContent)
  console.log(`page2 connectionId=${page2ConnectionId}`)

  // page1 で #example の DataChannel が open したことを確認
  await page1.waitForSelector('#messaging li', { state: 'attached' })

  // page2 で #example の DataChannel が open したことを確認
  await page2.waitForSelector('#messaging li', { state: 'attached' })

  // page1からpage2へメッセージを送信
  const page1Message = 'Hello from page1'
  await page1.fill('input[name="message"]', page1Message)
  await page1.click('#send-message')

  // page2でメッセージが受信されたことを確認
  await page2.waitForSelector('#received-messages li', { state: 'attached' })
  const receivedMessage1 = await page2.$eval('#received-messages li', (el) => el.textContent)

  // 受信したメッセージが期待したものであるか検証
  // receivedMessage の先頭 26 バイトには sender_connection_id が含まれている
  test.expect(receivedMessage1?.slice(0, 26)).toBe(page1ConnectionId)
  // 27 文字目からは page1 のメッセージがそのまま
  test.expect(receivedMessage1).toContain(page1Message)

  // page2からpage1へメッセージを送信
  const page2Message = 'Hello from page2'
  await page2.fill('input[name="message"]', page2Message)
  await page2.click('#send-message')

  // page1でメッセージが受信されたことを確認
  await page1.waitForSelector('#received-messages li', { state: 'attached' })
  const receivedMessage2 = await page1.$eval('#received-messages li', (el) => el.textContent)

  // 受信したメッセージが期待したものであるか検証
  console.log(`Received message on page1: ${receivedMessage2}`)
  // receivedMessage の先頭 26 バイトには sender_connection_id が含まれている
  test.expect(receivedMessage2?.slice(0, 26)).toBe(page2ConnectionId)
  // 27 文字目からは page2 のメッセージがそのまま
  test.expect(receivedMessage2).toContain(page2Message)

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await page1.click('#get-stats')
  await page2.click('#get-stats')

  // 統計情報が表示されるまで待機
  await page1.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const page1StatsReportJson: Record<string, unknown>[] = await page1.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  // page1 stats report
  const page1DataChannelStats = page1StatsReportJson.filter(
    (report) => report.type === 'data-channel',
  )

  expect(
    page1DataChannelStats.find((stats) => {
      return stats.label === 'signaling' && stats.state === 'open'
    }),
  ).toBeDefined()

  expect(
    page1DataChannelStats.find((stats) => {
      return stats.label === 'push' && stats.state === 'open'
    }),
  ).toBeDefined()

  expect(
    page1DataChannelStats.find((stats) => {
      return stats.label === 'notify' && stats.state === 'open'
    }),
  ).toBeDefined()

  expect(
    page1DataChannelStats.find((stats) => {
      return stats.label === 'stats' && stats.state === 'open'
    }),
  ).toBeDefined()

  const page1ExampleStats = page1DataChannelStats.find((stats) => {
    return stats.label === '#example' && stats.state === 'open'
  })
  // ここで undefined ではないことを確認してる
  expect(page1ExampleStats).toBeDefined()
  expect(page1ExampleStats?.messagesSent).toBeGreaterThan(0)
  expect(page1ExampleStats?.bytesSent).toBeGreaterThan(0)
  expect(page1ExampleStats?.messagesSent).toBeGreaterThan(0)

  // 統計情報が表示されるまで待機
  await page2.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const page2StatsReportJson: Record<string, unknown>[] = await page2.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  // page2 stats report
  const page2DataChannelStats = page2StatsReportJson.filter(
    (report) => report.type === 'data-channel',
  )

  expect(
    page2DataChannelStats.find((stats) => {
      return stats.label === 'signaling' && stats.state === 'open'
    }),
  ).toBeDefined()

  expect(
    page2DataChannelStats.find((stats) => {
      return stats.label === 'push' && stats.state === 'open'
    }),
  ).toBeDefined()

  expect(
    page2DataChannelStats.find((stats) => {
      return stats.label === 'notify' && stats.state === 'open'
    }),
  ).toBeDefined()

  expect(
    page2DataChannelStats.find((stats) => {
      return stats.label === 'stats' && stats.state === 'open'
    }),
  ).toBeDefined()

  const page2ExampleStats = page2DataChannelStats.find((stats) => {
    return stats.label === '#example' && stats.state === 'open'
  })
  // ここで undefined ではないことを確認してる
  expect(page2ExampleStats).toBeDefined()
  expect(page2ExampleStats?.bytesReceived).toBeGreaterThan(0)
  expect(page2ExampleStats?.messagesReceived).toBeGreaterThan(0)
  expect(page2ExampleStats?.bytesSent).toBeGreaterThan(0)
  expect(page2ExampleStats?.messagesSent).toBeGreaterThan(0)

  await page1.click('#disconnect')
  await page2.click('#disconnect')

  await page1.close()
  await page2.close()
})
