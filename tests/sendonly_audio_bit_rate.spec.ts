import { expect, test } from '@playwright/test'

test('sendonly bit rate pages', async ({ browser }) => {
  // 新しいページを作成
  const sendonly = await browser.newPage()
  // ページに対して操作を行う
  await sendonly.goto('http://localhost:9000/sendonly_audio_bit_rate/')

  // select 要素から直接オプションを取得してランダムに選択
  const randomBitrate = await sendonly.evaluate(() => {
    const select = document.querySelector('#audio-bit-rate') as HTMLSelectElement
    const options = Array.from(select.options).filter((option) => option.value !== '') // 未指定を除外
    const randomOption = options[Math.floor(Math.random() * options.length)]
    select.value = randomOption.value
    return randomOption.value
  })

  // ログで選択されたビットレートを表示
  console.log(`Selected bitrate: ${randomBitrate} kbps`)

  await sendonly.click('#start')
  // #connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendonly.waitForSelector('#connection-id:not(:empty)')
  // #connection-id 要素の内容を取得
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

  // 選択されたビットレートに基づいて期待値を設定
  const expectedBitrate = Number.parseInt(randomBitrate) * 1000
  expect(sendonlyAudioOutboundRtp?.targetBitrate).toEqual(expectedBitrate)

  await sendonly.click('#stop')
  await sendonly.close()
})
