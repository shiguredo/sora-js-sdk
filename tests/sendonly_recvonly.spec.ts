import { expect, test } from '@playwright/test'

test('sendonly/recvonly pages', async ({ browser }) => {
  // 新しいページを2つ作成
  const sendonly = await browser.newPage()
  const recvonly = await browser.newPage()

  // それぞれのページに対して操作を行う
  await sendonly.goto('http://localhost:9000/sendonly/')
  await recvonly.goto('http://localhost:9000/recvonly/')

  await sendonly.click('#start')
  await recvonly.click('#start')

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendonly.waitForSelector('#connection-id:not(:empty)')

  // #sendonly-connection-id 要素の内容を取得
  const sendonlyConnectionId = await sendonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendonly connectionId=${sendonlyConnectionId}`)

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await recvonly.waitForSelector('#connection-id:not(:empty)')

  // #sendrecv1-connection-id 要素の内容を取得
  const recvonlyConnectionId = await recvonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`recvonly connectionId=${recvonlyConnectionId}`)

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await sendonly.click('#get-stats')

  // 統計情報が表示されるまで待機
  await sendonly.waitForSelector('#stats-report')

  // データセットから統計情報を取得
  const statsJson: [Record<string, unknown>] = await sendonly.evaluate(() => {
    const statsDiv = document.querySelector('#stats-report') as HTMLElement
    return statsDiv ? JSON.parse(statsDiv.dataset.statsJson || '[]') : []
  })

  // 音声の audioCodecStats を取得
  const audioCodecStats = statsJson.find(
    (report) => report.type === 'codec' && report.mimeType === 'audio/opus',
  )
  expect(audioCodecStats).toBeDefined()

  // 音声の audioOutboundRtp を取得
  const audioOutboundRtp = statsJson.find(
    (report) => report.type === 'outbound-rtp' && report.kind === 'audio',
  )
  expect(audioOutboundRtp).toBeDefined()
  expect(audioOutboundRtp?.bytesSent).toBeGreaterThan(0)
  expect(audioOutboundRtp?.packetsSent).toBeGreaterThan(0)

  // 音声の videoCodecStats を取得
  const videoCodecStats = statsJson.find(
    (report) => report.type === 'codec' && report.mimeType === 'video/VP9',
  )
  expect(videoCodecStats).toBeDefined()

  // 音声の videoOutboundRtp を取得
  const videoOutboundRtp = statsJson.find(
    (report) => report.type === 'outbound-rtp' && report.kind === 'video',
  )
  expect(videoOutboundRtp).toBeDefined()
  expect(videoOutboundRtp?.bytesSent).toBeGreaterThan(0)
  expect(videoOutboundRtp?.packetsSent).toBeGreaterThan(0)

  await sendonly.click('#stop')
  await recvonly.click('#stop')

  await sendonly.close()
  await recvonly.close()
})
