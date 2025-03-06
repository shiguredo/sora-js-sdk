import { expect, test } from '@playwright/test'

test('simulcast sendonly/recvonly pages', async ({ browser }) => {
  const sendonly = await browser.newPage()
  const recvonly = await browser.newPage()

  await sendonly.goto('http://localhost:9000/simulcast_sendonly/')
  await recvonly.goto('http://localhost:9000/simulcast_recvonly/')

  // recvonly の simulcast_rid を r2 に設定
  await recvonly.selectOption('#simulcast-rid', 'r2')

  await sendonly.click('#connect')
  await recvonly.click('#connect')

  // #connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendonly.waitForSelector('#connection-id:not(:empty)')

  // #connection-id 要素の内容を取得
  const sendonlyConnectionId = await sendonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendonly connectionId=${sendonlyConnectionId}`)

  // #recvonly-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await recvonly.waitForSelector('#connection-id:not(:empty)')
  // #recvonly-connection-id 要素の内容を取得
  const recvonlyConnectionId = await recvonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`recvonly connectionId=${recvonlyConnectionId}`)

  // レース対策
  await sendonly.waitForTimeout(3000)
  await recvonly.waitForTimeout(3000)

  // sendonly stats report
  // 'Get Stats' ボタンをクリックして統計情報を取得
  await sendonly.click('#get-stats')

  // 統計情報が表示されるまで待機
  await sendonly.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const sendonlyStatsReportJson: Record<string, unknown>[] = await sendonly.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  // sendonly stats report
  const sendonlyVideoCodecStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === 'video/VP8',
  )
  expect(sendonlyVideoCodecStats).toBeDefined()

  const sendonlyVideoR0OutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r0',
  )
  expect(sendonlyVideoR0OutboundRtpStats).toBeDefined()
  expect(sendonlyVideoR0OutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyVideoR0OutboundRtpStats?.packetsSent).toBeGreaterThan(0)
  expect(sendonlyVideoR0OutboundRtpStats?.scalabilityMode).toEqual('L1T1')

  const sendonlyVideoR1OutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r1',
  )
  expect(sendonlyVideoR1OutboundRtpStats).toBeDefined()
  expect(sendonlyVideoR1OutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyVideoR1OutboundRtpStats?.packetsSent).toBeGreaterThan(0)
  expect(sendonlyVideoR1OutboundRtpStats?.scalabilityMode).toEqual('L1T1')

  const sendonlyVideoR2OutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r2',
  )
  expect(sendonlyVideoR2OutboundRtpStats).toBeDefined()
  expect(sendonlyVideoR2OutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(sendonlyVideoR2OutboundRtpStats?.packetsSent).toBeGreaterThan(0)
  expect(sendonlyVideoR2OutboundRtpStats?.scalabilityMode).toEqual('L1T1')

  // recvonly stats report
  // 'Get Stats' ボタンをクリックして統計情報を取得
  await recvonly.click('#get-stats')

  // 統計情報が表示されるまで待機
  await recvonly.waitForSelector('#stats-report')
  // データセットから統計情報を取得
  const recvonlyStatsReportJson: Record<string, unknown>[] = await recvonly.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  const recvonlyVideoInboundRtpStats = recvonlyStatsReportJson.find(
    (stats) => stats.type === 'inbound-rtp' && stats.kind === 'video',
  )
  expect(recvonlyVideoInboundRtpStats).toBeDefined()
  // r2 を指定してるので解像度を確認する
  expect(recvonlyVideoInboundRtpStats?.frameWidth).toBe(1281)
  expect(recvonlyVideoInboundRtpStats?.frameHeight).toBe(720)
  expect(recvonlyVideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0)
  expect(recvonlyVideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0)

  await sendonly.click('#disconnect')
  await recvonly.click('#disconnect')

  await sendonly.close()
  await recvonly.close()
})
