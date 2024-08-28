import { expect, test } from '@playwright/test'

test('sendonly audioBitRate', async ({ page }) => {
  await page.goto('http://localhost:5173/audio_sendonly/')

  // 1. audioBitRate=指定なしの時 targetBitrate が 64000
  await page.click('#start')
  await page.click('#get-stats')
  await page.waitForSelector("#stats-report'")
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
})
