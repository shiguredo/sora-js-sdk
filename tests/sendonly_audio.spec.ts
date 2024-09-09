import { expect, test } from '@playwright/test'

test('sendonly audio pages', async ({ browser }) => {
  // 新しいページを作成
  const sendonly = await browser.newPage()
  // ページに対して操作を行う
  await sendonly.goto('http://localhost:9000/sendonly_audio/')

  // select 要素から直接オプションを取得してランダムに選択
  // 音声コーデック
  const randomAudioCodec = await sendonly.evaluate(() => {
    const select = document.querySelector('#audio-codec-type') as HTMLSelectElement
    const options = Array.from(select.options)
    const randomOption = options[Math.floor(Math.random() * options.length)]
    select.value = randomOption.value
    return randomOption.value
  })
  // 音声ビットレート
  const randomBitrate = await sendonly.evaluate(() => {
    const select = document.querySelector('#audio-bit-rate') as HTMLSelectElement
    const options = Array.from(select.options).filter((option) => option.value !== '') // 未指定を除外
    const randomOption = options[Math.floor(Math.random() * options.length)]
    select.value = randomOption.value
    return randomOption.value
  })

  // ログで選択された音声コーデック・音声ビットレートを表示
  console.log(`Selected codec: ${randomAudioCodec}`)
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

  // 音声コーデック : 今は指定してもしなくても OPUS のみ
  const sendonlyAudioCodecStats = sendonlyStatsReportJson.find(
    (report) => report.type === 'codec' && report.mimeType === 'audio/opus',
  )
  expect(sendonlyAudioCodecStats).toBeDefined()

  // 音声ビットレート
  const sendonlyAudioOutboundRtp = sendonlyStatsReportJson.find(
    (report) => report.type === 'outbound-rtp' && report.kind === 'audio',
  )
  expect(sendonlyAudioOutboundRtp).toBeDefined()

  // 音声が正常に送れているか確認
  expect(sendonlyAudioOutboundRtp?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyAudioOutboundRtp?.packetsSent).toBeGreaterThan(0)

  // 選択に基づいて期待値を設定
  const expectedBitrate = Number.parseInt(randomBitrate) * 1000
  expect(sendonlyAudioOutboundRtp?.targetBitrate).toEqual(expectedBitrate)

  await sendonly.click('#stop')
  await sendonly.close()
})
