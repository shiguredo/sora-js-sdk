import { expect, test } from '@playwright/test'

test('simulcast sendonly/recvonly pages', async ({ page }) => {
  await page.goto('http://localhost:9000/simulcast/')

  await page.click('#connect')

  // 安全によせて 5 秒待つ
  await page.waitForTimeout(5000)

  await page.waitForSelector('#local-video-connection-id:not(:empty)')
  const localConnectionId = await page.$eval('#local-video-connection-id', (el) => el.textContent)
  console.log(`local connectionId=${localConnectionId}`)

  await page.waitForSelector('#remote-video-connection-id-r0:not(:empty)')
  const remoteR0ConnectionId = await page.$eval(
    '#remote-video-connection-id-r0',
    (el) => el.textContent,
  )
  console.log(`remote | rid=r0, connectionId=${remoteR0ConnectionId}`)

  await page.waitForSelector('#remote-video-connection-id-r1:not(:empty)')
  const remoteR1ConnectionId = await page.$eval(
    '#remote-video-connection-id-r1',
    (el) => el.textContent,
  )
  console.log(`remote | rid=r1, connectionId=${remoteR1ConnectionId}`)

  await page.waitForSelector('#remote-video-connection-id-r2:not(:empty)')
  const remoteR2ConnectionId = await page.$eval(
    '#remote-video-connection-id-r2',
    (el) => el.textContent,
  )
  console.log(`remote | rid=r2, connectionId=${remoteR2ConnectionId}`)

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await page.click('#get-stats')

  // 統計情報が表示されるまで待機
  await page.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const sendonlyStatsReportJson: Record<string, unknown>[] = await page.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  // sendonly stats report
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

  await page.click('#disconnect')
})
