import { expect, test } from '@playwright/test'

test('messaging pages', async ({ browser }) => {
  // 新しいページを2つ作成
  const page1 = await browser.newPage()
  const page2 = await browser.newPage()

  // それぞれのページに対して操作を行う
  await page1.goto('http://localhost:9000/messaging/')
  await page2.goto('http://localhost:9000/messaging/')

  await page1.click('#start')
  await page2.click('#start')

  await page1.waitForSelector('#connection-id:not(:empty)')
  const page1ConnectionId = await page1.$eval('#connection-id', (el) => el.textContent)
  console.log(`page1 connectionId=${page1ConnectionId}`)

  await page2.waitForSelector('#connection-id:not(:empty)')
  const page2ConnectionId = await page2.$eval('#connection-id', (el) => el.textContent)
  console.log(`page2 connectionId=${page2ConnectionId}`)

  // page1からpage2へメッセージを送信
  const page1Message = 'Hello from page1'
  await page1.fill('input[name="message"]', page1Message)
  await page1.click('#send-message')

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await page1.click('#get-stats')

  // 'Get Stats' ボタンをクリックして統計情報を取得
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

  const exampleStats = page1DataChannelStats.find((stats) => {
    return stats.label === '#example' && stats.state === 'open'
  })
  expect(exampleStats).toBeDefined()
  expect(exampleStats?.messagesSent).toBeGreaterThan(0)
  expect(exampleStats?.bytesSent).toBeGreaterThan(0)

  // 統計情報が表示されるまで待機
  await page2.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const page2StatsReportJson: Record<string, unknown>[] = await page2.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })
  console.log(page2StatsReportJson)

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
  expect(page2ExampleStats).toBeDefined()

  if (page2ExampleStats !== undefined) {
    expect(page2ExampleStats.bytesReceived).toBeGreaterThan(0)
    expect(page2ExampleStats.messagesReceived).toBeGreaterThan(0)
  }

  // page2でメッセージが受信されたことを確認
  // await page2.waitForSelector('#received-messages li', { state: 'attached' })
  // const receivedMessage1 = await page2.$eval('#received-messages li', (el) => el.textContent)

  // // 受信したメッセージが期待したものであるか検証
  // console.log(`Received message on page2: ${receivedMessage1}`)
  // test.expect(receivedMessage1).toBe(page1Message)

  // // page2からpage1へメッセージを送信
  // const page2Message = 'Hello from page2'
  // await page2.fill('input[name="message"]', page2Message)
  // await page2.click('#send-message')

  // // page1でメッセージが受信されたことを確認
  // await page1.waitForSelector('li', { state: 'attached' })
  // const receivedMessage2 = await page1.$eval('#received-messages li', (el) => el.textContent)

  // // 受信したメッセージが期待したものであるか検証
  // console.log(`Received message on page1: ${receivedMessage2}`)
  // test.expect(receivedMessage2).toBe(page2Message)

  await page1.click('#stop')
  await page2.click('#stop')

  await page1.close()
  await page2.close()
})
