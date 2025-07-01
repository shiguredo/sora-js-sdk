import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('simulcast sendonly/recvonly pages', async ({ browser }) => {
  const context1 = await browser.newContext()
  const context2 = await browser.newContext()
  const sendonly = await context1.newPage()
  const recvonly = await context2.newPage()

  await sendonly.goto('http://localhost:9000/simulcast_sendonly/')
  await recvonly.goto('http://localhost:9000/simulcast_recvonly/')

  const channelName = randomUUID()

  // チャンネル名を設定
  await sendonly.fill('#channel-name', channelName)
  await recvonly.fill('#channel-name', channelName)

  // recvonly の simulcast_rid を r1 に設定
  const simulcastRid = 'r1'
  await recvonly.selectOption('#simulcast-rid', simulcastRid)
  console.log(`recvonly simulcast_rid=${simulcastRid}`)

  await sendonly.click('#connect')
  await recvonly.click('#connect')

  // #connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendonly.waitForSelector('#connection-id:not(:empty)')

  // #connection-id 要素の内容を取得
  const sendonlyConnectionId = await sendonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendonly connectionId=${sendonlyConnectionId}`)

  // #recvonly-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await recvonly.waitForSelector('#connection-id:not(:empty)')
  // #recvonly-connection-id 要素の内容を取得
  const recvonlyConnectionId = await recvonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`recvonly connectionId=${recvonlyConnectionId}`)

  // レース対策
  await recvonly.waitForTimeout(8000)

  // sendonly stats report
  await sendonly.click('#get-stats')
  await recvonly.click('#get-stats')

  // 統計情報が表示されるまで待機
  await sendonly.waitForSelector('#stats-report')
  await recvonly.waitForSelector('#stats-report')

  // sendonly 統計情報
  const sendonlyStatsReportJson: Record<string, unknown>[] = await sendonly.evaluate(() => {
    const statsReportDiv = document.querySelector<HTMLDivElement>('#stats-report')
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  const sendonlyVideoCodecStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === 'video/VP8',
  )
  expect(sendonlyVideoCodecStats).toBeDefined()

  const sendonlyVideoR0OutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r0',
  )
  expect(sendonlyVideoR0OutboundRtpStats).toBeDefined()
  expect(sendonlyVideoR0OutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyVideoR0OutboundRtpStats?.packetsSent).toBeGreaterThan(0)
  expect(sendonlyVideoR0OutboundRtpStats?.scalabilityMode).toEqual('L1T1')

  const sendonlyVideoR1OutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r1',
  )
  expect(sendonlyVideoR1OutboundRtpStats).toBeDefined()
  expect(sendonlyVideoR1OutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyVideoR1OutboundRtpStats?.packetsSent).toBeGreaterThan(0)
  expect(sendonlyVideoR1OutboundRtpStats?.scalabilityMode).toEqual('L1T1')

  const sendonlyVideoR2OutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r2',
  )
  expect(sendonlyVideoR2OutboundRtpStats).toBeDefined()
  expect(sendonlyVideoR2OutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyVideoR2OutboundRtpStats?.packetsSent).toBeGreaterThan(0)
  expect(sendonlyVideoR2OutboundRtpStats?.scalabilityMode).toEqual('L1T1')

  // recvonly の統計情報を取得
  const recvonlyStatsReportJson: Record<string, unknown>[] = await recvonly.evaluate(() => {
    const statsReportDiv = document.querySelector<HTMLDivElement>('#stats-report')
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  const recvonlyVideoInboundRtpStats = recvonlyStatsReportJson.find(
    (stats) => stats.type === 'inbound-rtp' && stats.kind === 'video',
  )
  expect(recvonlyVideoInboundRtpStats).toBeDefined()

  // r1 が送信している解像度と等しいかどうかを確認する
  // r2 は一番早めに諦められてしまい flaky test になるので r1 を確認する
  // ここは解像度を固定していないのは flaky test になるためあくまで送信している解像度と等しいかどうかを確認する
  expect(recvonlyVideoInboundRtpStats?.frameWidth).toBe(sendonlyVideoR1OutboundRtpStats?.frameWidth)
  expect(recvonlyVideoInboundRtpStats?.frameHeight).toBe(
    sendonlyVideoR1OutboundRtpStats?.frameHeight,
  )
  expect(recvonlyVideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0)
  expect(recvonlyVideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0)

  await sendonly.click('#disconnect')
  await recvonly.click('#disconnect')

  await sendonly.close()
  await recvonly.close()
  await context1.close()
  await context2.close()
})
