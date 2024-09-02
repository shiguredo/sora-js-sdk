import { expect, test } from '@playwright/test'

test('sendonly bit rate pages', async ({ browser }) => {
  // 新しいページを2つ作成
  const sendonly = await browser.newPage()

  // それぞれのページに対して操作を行う
  await sendonly.goto('http://localhost:9000/sendonly_audio_bit_rate/')

  await sendonly.click('#start')

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendonly.waitForSelector('#connection-id:not(:empty)')

  // #sendonly-connection-id 要素の内容を取得
  const sendonlyConnectionId = await sendonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendonly connectionId=${sendonlyConnectionId}`)

  // レース対策
  await sendonly.waitForTimeout(3000)

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await sendonly.click('#get-stats')

  // 統計情報が表示されるまで待機
  await sendonly.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const sendonlyStatsReportJson: Record<string, unknown>[] = await sendonly.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  // XXX: GitHub Actions 上の playwright の場合はどうやら音声が配信されないので確認する

  const sendonlyAudioCodecStats = sendonlyStatsReportJson.find(
    (report) => report.type === 'codec' && report.mimeType === 'audio/opus',
  )
  expect(sendonlyAudioCodecStats).toBeDefined()

  const sendonlyAudioOutboundRtp = sendonlyStatsReportJson.find(
    (report) => report.type === 'outbound-rtp' && report.kind === 'audio',
  )
  expect(sendonlyAudioOutboundRtp).toBeDefined()
  expect(sendonlyAudioOutboundRtp?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyAudioOutboundRtp?.packetsSent).toBeGreaterThan(0)
  expect(sendonlyAudioOutboundRtp?.targetBitrate).toEqual(384000)

  await sendonly.click('#stop')

  await sendonly.close()
})
