import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

// Sora の異常切断 API を使用した sendrecv 自動再接続テスト
test('sendrecv_auto_reconnect with abnormal disconnection API', async ({ browser }) => {
  test.skip(
    process.env.RUNNER_ENVIRONMENT === 'self-hosted',
    'Sora API を利用するので Tailscale が利用できない self-hosted では実行しない',
  )

  // 2つのページを作成
  const context1 = await browser.newContext()
  const page1 = await context1.newPage()
  const context2 = await browser.newContext()
  const page2 = await context2.newPage()

  // デバッグ用
  page1.on('console', (msg) => {
    console.log('[Page1]', msg.type(), msg.text())
  })
  page2.on('console', (msg) => {
    console.log('[Page2]', msg.type(), msg.text())
  })

  // 両方のページを自動再接続テストページへ遷移
  await page1.goto('http://localhost:9000/sendrecv_auto_reconnect/')
  await page2.goto('http://localhost:9000/sendrecv_auto_reconnect/')

  // SDK バージョンの表示
  await page1.waitForSelector('#sora-js-sdk-version')
  const sdkVersion = await page1.$eval('#sora-js-sdk-version', (el) => el.textContent)
  console.log(`sdkVersion=${sdkVersion}`)

  // 同じチャンネル名を使用
  const channelName = randomUUID()
  await page1.fill('#channel-name', channelName)
  await page2.fill('#channel-name', channelName)

  // 両方のページで接続
  await page1.click('#connect')
  await page2.click('#connect')

  // 両方のページで初回接続時の connection-id を取得
  await page1.waitForSelector('#connection-id:not(:empty)')
  const connectionId1 = await page1.$eval('#connection-id', (el: HTMLElement) => el.textContent)
  console.log(`[Page1] connectionId=${connectionId1}`)

  await page2.waitForSelector('#connection-id:not(:empty)')
  const connectionId2 = await page2.$eval('#connection-id', (el: HTMLElement) => el.textContent)
  console.log(`[Page2] connectionId=${connectionId2}`)

  // お互いのビデオが表示されるのを待つ
  await page1.waitForSelector('#remote-videos video', { timeout: 10000 })
  await page2.waitForSelector('#remote-videos video', { timeout: 10000 })
  console.log('Both pages connected and video streams established')

  // レース対策
  await page1.waitForTimeout(3000)

  // Page1 側から abnormal disconnect ボタンを押す
  await page1.click('#abnormal-disconnect-api')

  // Page1 の再接続中の状態を確認
  await page1.waitForSelector('#reconnect-status:has-text("Reconnecting...")', { timeout: 10000 })
  console.log('[Page1] Auto reconnecting...')

  // Page1 の再接続成功を待つ
  await page1.waitForSelector('#reconnect-status:has-text("Reconnected")', { timeout: 15000 })
  console.log('[Page1] Auto reconnected successfully')

  // Page1 の新しい connection-id を取得
  await page1.waitForSelector('#connection-id:not(:empty)')
  const reconnectConnectionId1 = await page1.$eval(
    '#connection-id',
    (el: HTMLElement) => el.textContent,
  )
  console.log(`[Page1] reconnectConnectionId=${reconnectConnectionId1}`)

  // connection-id が変わっていることを確認
  expect(reconnectConnectionId1).not.toBe(connectionId1)

  // Page1 の再接続ログの確認
  await page1.waitForSelector('#reconnect-log')
  const reconnectLog = await page1.$eval('#reconnect-log', (el: HTMLElement) => el.textContent)
  expect(reconnectLog).toBe('Success')

  // 試行回数の確認（1回目で成功するはず）
  const attemptText = await page1.$eval('#reconnect-attempt', (el: HTMLElement) => el.textContent)
  expect(attemptText).toBe('Attempt: 1')

  // 再接続後もお互いのビデオが表示されることを確認
  await page1.waitForSelector('#remote-videos video', { timeout: 10000 })
  await page2.waitForSelector('#remote-videos video', { timeout: 10000 })
  console.log('Video streams re-established after reconnection')

  // レース対策
  await page1.waitForTimeout(5000)

  // Page1 の統計情報を取得
  await page1.click('#get-stats')
  // 統計情報が表示されるまで待機
  await page1.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const page1StatsReportJson: Record<string, unknown>[] = await page1.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  // Page1 の video outbound-rtp 統計を確認
  const page1VideoOutboundRtpStats = page1StatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video',
  )
  expect(page1VideoOutboundRtpStats).toBeDefined()
  expect(page1VideoOutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(page1VideoOutboundRtpStats?.packetsSent).toBeGreaterThan(0)

  // Page1 の video inbound-rtp 統計を確認
  const page1VideoInboundRtpStats = page1StatsReportJson.find(
    (stats) => stats.type === 'inbound-rtp' && stats.kind === 'video',
  )
  expect(page1VideoInboundRtpStats).toBeDefined()
  expect(page1VideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0)
  expect(page1VideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0)

  // Page2 の統計情報を取得
  await page2.click('#get-stats')
  // 統計情報が表示されるまで待機
  await page2.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const page2StatsReportJson: Record<string, unknown>[] = await page2.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  // Page2 の video outbound-rtp 統計を確認
  const page2VideoOutboundRtpStats = page2StatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video',
  )
  expect(page2VideoOutboundRtpStats).toBeDefined()
  expect(page2VideoOutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(page2VideoOutboundRtpStats?.packetsSent).toBeGreaterThan(0)

  // Page2 の video inbound-rtp 統計を確認
  const page2VideoInboundRtpStats = page2StatsReportJson.find(
    (stats) => stats.type === 'inbound-rtp' && stats.kind === 'video',
  )
  expect(page2VideoInboundRtpStats).toBeDefined()
  expect(page2VideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0)
  expect(page2VideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0)

  // クリーンアップ
  await page1.close()
  await page2.close()
  await context1.close()
  await context2.close()
})
