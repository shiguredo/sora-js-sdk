import { expect, test } from '@playwright/test'

test('sendonly audioBitRate', async ({ page }) => {
  await page.goto('http://localhost:9000/audio_sendonly/')

  // audioBitRate=指定なしの時 targetBitrate=64000
  await page.locator('#start').click({ timeout: 5000 })
  await page.locator('#get-stats').click({ timeout: 5000 })
  await page.waitForSelector('#stats-report', { timeout: 5000 })
  const statsReportJson: Record<string, unknown>[] = await page.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })
  const outboundRtp = statsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'audio',
  )
  expect(outboundRtp).toBeDefined()
  expect(outboundRtp?.targetBitrate).toEqual(64 * 1000)

  await page.click('#stop')
  // await page.reload()

  // audioBitRate=指定あり の時 targetBitrate=指定した数 [32-384]
  const audioBitRateList: number[] = [0, 32, 64, 128, 256, 324]
  const length: number = audioBitRateList.length
  const audioBitRate: number = Math.floor(Math.random() * length)
  const targetBitRate: number = audioBitRate * 1000
  console.log('audioBitRate =%s', audioBitRate)
  await page.fill('input[name="audio-bit-rate"]', String(audioBitRate))
  await page.locator('#start').click({ timeout: 5000 })
  await page.locator('#get-stats').click({ timeout: 5000 })
  // await page.click('#get-stats')
  await page.waitForSelector('#stats-report')
  const statsReportJson02: Record<string, unknown>[] = await page.evaluate(() => {
    const statsReportDiv02 = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv02 ? JSON.parse(statsReportDiv02.dataset.statsReportJson || '[]') : []
  })
  const outboundRtp02 = statsReportJson02.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'audio',
  )
  expect(outboundRtp02).toBeDefined()
  expect(outboundRtp02?.targetBitrate).toEqual(targetBitRate)

  await page.click('#stop')

  await page.close()
})
