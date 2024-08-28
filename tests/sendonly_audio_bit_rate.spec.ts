import { expect, test } from '@playwright/test'

test('sendonly audioBitRate', async ({ page }) => {
  await page.goto('http://localhost:9000/audio_sendonly/')

  // audioBitRate=指定なしの時 targetBitrate=64000
  await page.click('#start')
  await page.waitForTimeout(5000)
  await page.click('#get-stats')
  await page.waitForSelector('#stats-report')
  const statsReportJson: Record<string, unknown>[] = await page.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })
  const outboundRtp = statsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'audio',
  )
  expect(outboundRtp).toBeDefined()
  expect(outboundRtp?.targetBitrate).toEqual(64000)

  await page.click('#stop')
  // await page.reload()

  // audioBitRate=32 の時 targetBitrate=32000
  await page.locator('#audio-bit-rate').selectOption('32')
  await page.click('#start')
  await page.waitForTimeout(5000)
  await page.click('#get-stats')
  await page.waitForSelector('#stats-report')
  const statsReportJson02: Record<string, unknown>[] = await page.evaluate(() => {
    const statsReportDiv02 = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv02 ? JSON.parse(statsReportDiv02.dataset.statsReportJson || '[]') : []
  })
  const outboundRtp02 = statsReportJson02.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'audio',
  )
  expect(outboundRtp02).toBeDefined()
  expect(outboundRtp02?.targetBitrate).toEqual(32000)

  await page.click('#stop')

  await page.close()
})
