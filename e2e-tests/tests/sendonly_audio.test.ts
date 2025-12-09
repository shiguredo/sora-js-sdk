import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'

test('sendonly audio pages', async ({ browser }) => {
  // 新しいページを作成
  const sendonly = await browser.newPage()
  // ページに対して操作を行う
  await sendonly.goto('http://localhost:9000/sendonly_audio/')

  // チャネル名を uuid で生成する
  const channelName = randomUUID()

  await sendonly.fill('#channel-name', channelName)

  // select 要素から直接オプションを取得してランダムに選択する
  // 音声コーデック
  const selectedAudioCodec = await sendonly.evaluate(() => {
    const select = document.querySelector('#audio-codec-type') as HTMLSelectElement
    const options = Array.from(select.options)
    const randomOption = options[Math.floor(Math.random() * options.length)]
    select.value = randomOption.value
    return randomOption.value
  })
  // 音声ビットレート
  const selectedBitRate = await sendonly.evaluate(() => {
    const select = document.querySelector('#audio-bit-rate') as HTMLSelectElement
    const options = Array.from(select.options).filter((option) => option.value !== '') // 未指定を除外
    const randomOption = options[Math.floor(Math.random() * options.length)]
    select.value = randomOption.value
    return randomOption.value
  })

  // ランダムで選択した音声コーデック・音声ビットレートをログに表示する
  console.log(`Selected AudioCodec: ${selectedAudioCodec}`)
  console.log(`Selected BitRate: ${selectedBitRate} kbps`)

  // 'connect' ボタンをクリックして音声の送信を開始する
  await sendonly.click('#connect')
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

  // 音声コーデックを確認する : 今は指定してもしなくても OPUS のみ
  const sendonlyAudioCodecStats = sendonlyStatsReportJson.find(
    (report) => report.type === 'codec' && report.mimeType === 'audio/opus',
  )
  expect(sendonlyAudioCodecStats).toBeDefined()

  // 音声ビットレートを確認する：音声を送れているかと targetBitrate の確認
  const sendonlyAudioOutboundRtp = sendonlyStatsReportJson.find(
    (report) => report.type === 'outbound-rtp' && report.kind === 'audio',
  )
  expect(sendonlyAudioOutboundRtp).toBeDefined()

  // 音声が正常に送れているかを確認する
  expect(sendonlyAudioOutboundRtp?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyAudioOutboundRtp?.packetsSent).toBeGreaterThan(0)

  // 音声ビットレートの選択に基づいて期待値を設定し一致するかを確認する
  const expectedBitRate = Number.parseInt(selectedBitRate, 10) * 1000
  expect(sendonlyAudioOutboundRtp?.targetBitrate).toEqual(expectedBitRate)

  await sendonly.click('#disconnect')
  await sendonly.close()
})
