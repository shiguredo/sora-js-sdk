import { expect, test } from '@playwright/test'

test.skip('whip-simulcast', async ({ browser }) => {
  const whip = await browser.newPage()

  await whip.goto('http://localhost:9000/whip_simulcast/')

  // コーデックの取得
  const whipVideoCodecType = await whip.evaluate(() => {
    const videoElement = document.querySelector('#video-codec-type') as HTMLSelectElement
    return videoElement.value
  })
  console.log(`whipVideoCodecType=${whipVideoCodecType}`)

  // E2E テストでコーデックは AV1 でなければエラーにする
  if (whipVideoCodecType !== 'AV1') {
    throw new Error('whipVideoCodecType is not AV1')
  }

  await whip.click('#connect')

  // 安全によせて 5 秒待つ
  await whip.waitForTimeout(5000)

  // connection-state が "connected" になるまで待つ
  await whip.waitForSelector('#connection-state:has-text("connected")')

  // connection-stateの値を取得して確認
  const whipConnectionState = await whip.$eval('#connection-state', (el) => el.textContent)
  console.log(`whip connectionState=${whipConnectionState}`)

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await whip.click('#get-stats')

  // 統計情報が表示されるまで待機
  await whip.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const whipStatsReportJson: Record<string, unknown>[] = await whip.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  const whipVideoOutboundRtpStats = whipStatsReportJson.filter(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video',
  )
  console.log(whipVideoOutboundRtpStats)

  // sendonly stats report
  const whipVideoCodecStats = whipStatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === `video/${whipVideoCodecType}`,
  )
  expect(whipVideoCodecStats).toBeDefined()

  const whipVideoR0OutboundRtpStats = whipStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r0',
  )
  expect(whipVideoR0OutboundRtpStats).toBeDefined()

  const whipVideoR1OutboundRtpStats = whipStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r1',
  )
  expect(whipVideoR1OutboundRtpStats).toBeDefined()

  const whipVideoR2OutboundRtpStats = whipStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r2',
  )
  expect(whipVideoR2OutboundRtpStats).toBeDefined()

  await whip.click('#disconnect')

  // disconnected になるまで待つ
  // await whip.waitForSelector('#connection-state:has-text("disconnected")')

  // ページを閉じる
  await whip.close()
})
