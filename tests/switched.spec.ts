import { expect, test } from '@playwright/test'

test('sendonly type:switched pages', async ({ browser }) => {
  // 新しいページを2つ作成
  const sendonly = await browser.newPage()

  sendonly.on('console', (msg) => {
    console.log(msg.type(), msg.text())
  })

  // それぞれのページに対して操作を行う
  await sendonly.goto('http://localhost:9000/sendonly/')

  // SDK バージョンの表示
  await sendonly.waitForSelector('#sdk-version')
  const sendonlySdkVersion = await sendonly.$eval('#sdk-version', (el) => el.textContent)
  console.log(`sendonly sdkVersion=${sendonlySdkVersion}`)

  await sendonly.click('#connect')
  // console.log に [signaling] switched が出力されるまで待機するための Promise を作成する
  const consolePromise = sendonly.waitForEvent('console')

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendonly.waitForSelector('#connection-id:not(:empty)')

  // #sendonly-connection-id 要素の内容を取得
  const sendonlyConnectionId = await sendonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendonly connectionId=${sendonlyConnectionId}`)

  // レース対策
  await sendonly.waitForTimeout(3000)

  // Console log の Promise が解決されるまで待機する
  const msg = await consolePromise
  // log [signaling] switched websocket が出力されるので、args 0/1/2 をそれぞれチェックする
  // [signaling]
  const value1 = await msg.args()[0].jsonValue()
  expect(value1).toBe('[signaling]')
  // switched
  const value2 = await msg.args()[1].jsonValue()
  expect(value2).toBe('onmessage-switched')
  // websocket
  const value3 = await msg.args()[2].jsonValue()
  expect(value3).toBe('websocket')

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await sendonly.click('#get-stats')

  // 統計情報が表示されるまで待機
  await sendonly.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const sendonlyStatsReportJson: Record<string, unknown>[] = await sendonly.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  // sendonly audio codec
  const sendonlyAudioCodecStats = sendonlyStatsReportJson.find(
    (report) => report.type === 'codec' && report.mimeType === 'audio/opus',
  )
  expect(sendonlyAudioCodecStats).toBeDefined()

  // sendonly audio outbound-rtp
  const sendonlyAudioOutboundRtp = sendonlyStatsReportJson.find(
    (report) => report.type === 'outbound-rtp' && report.kind === 'audio',
  )
  expect(sendonlyAudioOutboundRtp).toBeDefined()
  expect(sendonlyAudioOutboundRtp?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyAudioOutboundRtp?.packetsSent).toBeGreaterThan(0)

  // sendonly video codec
  const sendonlyVideoCodecStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === 'video/VP9',
  )
  expect(sendonlyVideoCodecStats).toBeDefined()

  // sendonly video outbound-rtp
  const sendonlyVideoOutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video',
  )
  expect(sendonlyVideoOutboundRtpStats).toBeDefined()
  expect(sendonlyVideoOutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyVideoOutboundRtpStats?.packetsSent).toBeGreaterThan(0)

  await sendonly.click('#disconnect')

  await sendonly.close()
})
