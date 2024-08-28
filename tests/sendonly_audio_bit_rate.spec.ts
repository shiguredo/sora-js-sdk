import { expect, test } from '@playwright/test'

test('sendonly audioBitRate', async ({ page }) => {
  await page.goto('http://localhost:9000/audio_sendonly/')

  // audioBitRate=指定なしの時 targetBitrate=64000
  await page.click('#start')
  await page.waitForTimeout(5000)
  await page.click('#get-stats')
  // 統計情報が表示されるまで待機
  await page.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const statsReportJson: Record<string, unknown>[] = await page.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })
  const outboundRtp = statsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'audio',
  )
  expect(outboundRtp).toBeDefined()
  expect(outboundRtp?.targetBitrate).toEqual(64000)

  // audioBitRate=32 の時 targetBitrate=32000

  await page.click('#stop')
  await page.close()
})
