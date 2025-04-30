import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('authz simulcast encodings', async ({ page }) => {
  await page.goto('http://localhost:9000/simulcast_sendonly/')

  const channelName = randomUUID()

  await page.fill('#channel-name', channelName)

  await page.fill(
    '#simulcast-encodings',
    JSON.stringify([
      { rid: 'r0', active: true, scalabilityMode: 'L1T1' },
      { rid: 'r1', active: false },
      { rid: 'r2', active: false },
    ]),
  )

  await page.click('#connect')

  await page.waitForSelector('#connection-id:not(:empty)')
  const connectionId = await page.$eval('#connection-id', (el) => el.textContent)
  console.log(`connectionId=${connectionId}`)

  await page.waitForTimeout(3000)

  await page.click('#get-stats')

  await page.click('#disconnect')

  // simulcast sendonly 統計情報
  const sendonlyStatsReportJson: Record<string, unknown>[] = await page.evaluate(() => {
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
  expect(sendonlyVideoR0OutboundRtpStats?.packetsSent).toBeGreaterThan(2)
  expect(sendonlyVideoR0OutboundRtpStats?.scalabilityMode).toEqual('L1T1')

  const sendonlyVideoR1OutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r1',
  )
  expect(sendonlyVideoR1OutboundRtpStats).toBeDefined()
  expect(sendonlyVideoR1OutboundRtpStats?.bytesSent).toBe(0)
  expect(sendonlyVideoR1OutboundRtpStats?.packetsSent).toBeLessThanOrEqual(2)

  const sendonlyVideoR2OutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r2',
  )
  expect(sendonlyVideoR2OutboundRtpStats).toBeDefined()
  expect(sendonlyVideoR2OutboundRtpStats?.bytesSent).toBe(0)
  expect(sendonlyVideoR2OutboundRtpStats?.packetsSent).toBeLessThanOrEqual(2)

  await page.close()
})
