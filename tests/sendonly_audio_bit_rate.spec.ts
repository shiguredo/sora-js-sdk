import { expect, test } from '@playwright/test'

test('sendonly audioBitRate', async ({ page }) => {
  await page.goto('http://localhost:9000/audio_sendonly/')

  // audioBitRate=指定なしの時 targetBitrate=64000
  await page.click('#start')
  await page.click('#get-stats')
  await page.waitForSelector('#stats-report')
  const statsReportJson: Record<string, unknown>[] = await page.evaluate(() => {
    const statsReportDiv = document.querySelector("#stats-report'") as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJSON || '[]') : []
  })
  const outboundRTP = statsReportJson.filter((report) => report.type === 'outbound-rtp')
  expect(
    outboundRTP.find((stats) => {
      return stats.label === 'targetBitrate' && stats.state === '64000'
    }),
  ).toBeDefined()

  // audioBitRate=32 の時 targetBitrate=32000
})
