import { expect, test } from '@playwright/test'

test('sendonly audio codec type pages', async ({ browser }) => {
  const sendonly = await browser.newPage()
  await sendonly.goto('http://localhost:9000/sendonly_audio_codec/')

  // select 要素から直接オプションを取得してランダムに選択
  const randomAudioCodec = await sendonly.evaluate(() => {
    const select = document.querySelector('#audio-codec-type') as HTMLSelectElement
    const options = Array.from(select.options)
    const randomOption = options[Math.floor(Math.random() * options.length)]
    select.value = randomOption.value
    return randomOption.value
  })

  // 選択したコーデックタイプをログに出力
  console.log('Selected codec:', randomAudioCodec)

  // Start ボタンクリック
  await sendonly.click('#start')
  await sendonly.waitForSelector('#connection-id:not(:empty)')

  // #connection-id 要素の内容を取得
  const sendonlyConnectionId = await sendonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`Selected codec: connectionId=${sendonlyConnectionId}`)

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

  // 今は指定してもしなくても OPUS のみ
  expect(sendonlyAudioCodecStats).toBeDefined()
  const sendonlyAudioOutboundRtp = sendonlyStatsReportJson.find(
    (report) => report.type === 'outbound-rtp' && report.kind === 'audio',
  )
  // 音声が正常に送れているかの確認
  expect(sendonlyAudioOutboundRtp).toBeDefined()
  expect(sendonlyAudioOutboundRtp?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyAudioOutboundRtp?.packetsSent).toBeGreaterThan(0)

  await sendonly.click('#stop')
  await sendonly.close()
})
