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

  await sendonly.waitForTimeout(1000)
  await recvonly.waitForTimeout(1000)

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

  /*
  GitHub Actions 上の playwright の場合はどうやら音声が配信されない模様

  const sendonlyAudioCodecStats = statsJson.find(
    (report) => report.type === 'codec' && report.mimeType === 'audio/opus',
  )
  expect(sendonlyAudioCodecStats).toBeDefined()

  const sendonlyAudioOutboundRtp = statsJson.find(
    (report) => report.type === 'outbound-rtp' && report.kind === 'audio',
  )
  expect(sendonlyAudioOutboundRtp).toBeDefined()
  expect(sendonlyAudioOutboundRtp?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyAudioOutboundRtp?.packetsSent).toBeGreaterThan(0)
  */

  // sendonly stats report
  const sendonlyVideoCodecStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === 'video/VP9',
  )
  expect(sendonlyVideoCodecStats).toBeDefined()

  const sendonlyVideoOutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video',
  )
  expect(sendonlyVideoOutboundRtpStats).toBeDefined()
  expect(sendonlyVideoOutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyVideoOutboundRtpStats?.packetsSent).toBeGreaterThan(0)

  // recvonly stats report
  const recvonlyVideoCodecStats = recvonlyStatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === 'video/VP9',
  )
  expect(recvonlyVideoCodecStats).toBeDefined()

  const recvonlyVideoInboundRtpStats = recvonlyStatsReportJson.find(
    (stats) => stats.type === 'inbound-rtp' && stats.kind === 'video',
  )
  expect(recvonlyVideoInboundRtpStats).toBeDefined()
  expect(recvonlyVideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0)
  expect(recvonlyVideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0)

  await sendonly.click('#stop')
  await recvonly.click('#stop')

  await sendonly.close()
  await recvonly.close()
})
