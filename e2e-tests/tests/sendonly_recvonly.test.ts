import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('sendonly/recvonly pages', async ({ browser }) => {
  // 新しいページを2つ作成
  const sendonly = await browser.newPage()
  const recvonly = await browser.newPage()

  // それぞれのページに対して操作を行う
  await sendonly.goto('http://localhost:9000/sendonly/')
  await recvonly.goto('http://localhost:9000/recvonly/')

  // SDK バージョンの表示
  await sendonly.waitForSelector('#sdk-version')
  const sendonlySdkVersion = await sendonly.$eval('#sdk-version', (el) => el.textContent)
  console.log(`sendonly sdkVersion=${sendonlySdkVersion}`)

  await recvonly.waitForSelector('#sdk-version')
  const recvonlySdkVersion = await recvonly.$eval('#sdk-version', (el) => el.textContent)
  console.log(`recvonly sdkVersion=${recvonlySdkVersion}`)

  const channelName = randomUUID()

  // チャンネル名を設定
  await sendonly.fill('#channel-name', channelName)
  await recvonly.fill('#channel-name', channelName)

  await sendonly.click('#connect')
  await recvonly.click('#connect')

  // sendonly の #connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendonly.waitForSelector('#connection-id:not(:empty)')

  // sendonly の #connection-id 要素の内容を取得
  const sendonlyConnectionId = await sendonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendonly connectionId=${sendonlyConnectionId}`)

  // recvonly の #connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await recvonly.waitForSelector('#connection-id:not(:empty)')

  // recvonly の #connection-id 要素の内容を取得
  const recvonlyConnectionId = await recvonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`recvonly connectionId=${recvonlyConnectionId}`)

  // レース対策
  await sendonly.waitForTimeout(5000)
  await recvonly.waitForTimeout(5000)

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await sendonly.click('#get-stats')

  // 統計情報が表示されるまで待機
  await sendonly.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const sendonlyStatsReportJson: Record<string, unknown>[] = await sendonly.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await recvonly.click('#get-stats')

  // 統計情報が表示されるまで待機
  await recvonly.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const recvonlyStatsReportJson: Record<string, unknown>[] = await recvonly.evaluate(() => {
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

  // recvonly audio codec
  const recvonlyAudioCodecStats = recvonlyStatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === 'audio/opus',
  )
  expect(recvonlyAudioCodecStats).toBeDefined()

  // recvonly audio inbound-rtp
  const recvonlyAudioInboundRtpStats = recvonlyStatsReportJson.find(
    (stats) => stats.type === 'inbound-rtp' && stats.kind === 'audio',
  )
  expect(recvonlyAudioInboundRtpStats).toBeDefined()
  expect(recvonlyAudioInboundRtpStats?.bytesReceived).toBeGreaterThan(0)
  expect(recvonlyAudioInboundRtpStats?.packetsReceived).toBeGreaterThan(0)

  // recvonly video codec
  const recvonlyVideoCodecStats = recvonlyStatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === 'video/VP9',
  )
  expect(recvonlyVideoCodecStats).toBeDefined()

  // recvonly video inbound-rtp
  const recvonlyVideoInboundRtpStats = recvonlyStatsReportJson.find(
    (stats) => stats.type === 'inbound-rtp' && stats.kind === 'video',
  )
  expect(recvonlyVideoInboundRtpStats).toBeDefined()
  expect(recvonlyVideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0)
  expect(recvonlyVideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0)

  await sendonly.click('#disconnect')
  await recvonly.click('#disconnect')

  await sendonly.close()
  await recvonly.close()
})
