import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('WebKit', async ({ browser }) => {
  test.skip(
    test.info().project.name !== 'WebKit' || process.platform !== 'darwin',
    'WebKit かつ macOS でのみテストを行う',
  )

  const sendrecv1 = await browser.newPage()
  const sendrecv2 = await browser.newPage()

  await sendrecv1.goto('http://localhost:9000/sendrecv_webkit/')
  await sendrecv2.goto('http://localhost:9000/sendrecv_webkit/')

  const channelName = randomUUID()

  // チャンネル名を設定
  await sendrecv1.fill('#channel-name', channelName)
  await sendrecv2.fill('#channel-name', channelName)

  console.log(`sendrecv1 channelName: ${channelName}`)
  console.log(`sendrecv2 channelName: ${channelName}`)

  // sendrecv1 のビデオコーデックをランダムに選択
  await sendrecv1.evaluate(() => {
    const videoCodecTypeSelect = document.getElementById('video-codec-type') as HTMLSelectElement
    const options = Array.from(videoCodecTypeSelect.options).filter((option) => option.value !== '')
    const randomIndex = Math.floor(Math.random() * options.length)
    videoCodecTypeSelect.value = options[randomIndex].value
  })

  // sendrecv2 のビデオコーデックをランダムに選択
  await sendrecv2.evaluate(() => {
    const videoCodecTypeSelect = document.getElementById('video-codec-type') as HTMLSelectElement
    const options = Array.from(videoCodecTypeSelect.options).filter((option) => option.value !== '')
    const randomIndex = Math.floor(Math.random() * options.length)
    videoCodecTypeSelect.value = options[randomIndex].value
  })

  // 選択されたコーデックをログに出力
  const sendrecv1VideoCodecType = await sendrecv1.$eval(
    '#video-codec-type',
    (el) => (el as HTMLSelectElement).value,
  )
  const sendrecv2VideoCodecType = await sendrecv2.$eval(
    '#video-codec-type',
    (el) => (el as HTMLSelectElement).value,
  )
  console.log(`sendrecv1 videoCodecType: ${sendrecv1VideoCodecType}`)
  console.log(`sendrecv2 videoCodecType: ${sendrecv2VideoCodecType}`)

  await sendrecv1.click('#connect')
  await sendrecv2.click('#connect')

  // #connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendrecv1.waitForSelector('#connection-id:not(:empty)')

  // #connection-id 要素の内容を取得
  const sendrecv1ConnectionId = await sendrecv1.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendrecv1 connectionId=${sendrecv1ConnectionId}`)

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendrecv2.waitForSelector('#connection-id:not(:empty)')

  // #sendrecv1-connection-id 要素の内容を取得
  const sendrecv2ConnectionId = await sendrecv2.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendrecv2 connectionId=${sendrecv2ConnectionId}`)

  // レース対策
  await sendrecv1.waitForTimeout(5000)
  await sendrecv2.waitForTimeout(5000)

  // page1 stats report

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await sendrecv1.click('#get-stats')
  await sendrecv2.click('#get-stats')

  // 統計情報が表示されるまで待機
  await sendrecv1.waitForSelector('#stats-report')
  await sendrecv2.waitForSelector('#stats-report')

  // データセットから統計情報を取得
  const sendrecv1StatsReportJson: Record<string, unknown>[] = await sendrecv1.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  const sendrecv1AudioCodecStats = sendrecv1StatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === 'audio/opus',
  )
  expect(sendrecv1AudioCodecStats).toBeDefined()

  const sendrecv1VideoCodecStats = sendrecv1StatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === `video/${sendrecv1VideoCodecType}`,
  )
  expect(sendrecv1VideoCodecStats).toBeDefined()

  const sendrecv1AudioOutboundRtpStats = sendrecv1StatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'audio',
  )
  expect(sendrecv1AudioOutboundRtpStats).toBeDefined()
  expect(sendrecv1AudioOutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(sendrecv1AudioOutboundRtpStats?.packetsSent).toBeGreaterThan(0)

  const sendrecv1VideoOutboundRtpStats = sendrecv1StatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video',
  )
  expect(sendrecv1VideoOutboundRtpStats).toBeDefined()
  expect(sendrecv1VideoOutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(sendrecv1VideoOutboundRtpStats?.packetsSent).toBeGreaterThan(0)

  const sendrecv1AudioInboundRtpStats = sendrecv1StatsReportJson.find(
    (stats) => stats.type === 'inbound-rtp' && stats.kind === 'audio',
  )
  expect(sendrecv1AudioInboundRtpStats).toBeDefined()
  expect(sendrecv1AudioInboundRtpStats?.bytesReceived).toBeGreaterThan(0)
  expect(sendrecv1AudioInboundRtpStats?.packetsReceived).toBeGreaterThan(0)

  const sendrecv1VideoInboundRtpStats = sendrecv1StatsReportJson.find(
    (stats) => stats.type === 'inbound-rtp' && stats.kind === 'video',
  )
  expect(sendrecv1VideoInboundRtpStats).toBeDefined()
  expect(sendrecv1VideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0)
  expect(sendrecv1VideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0)

  // データセットから統計情報を取得
  const sendrecv2StatsReportJson: Record<string, unknown>[] = await sendrecv2.evaluate(() => {
    const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  const sendrecv2AudioCodecStats = sendrecv2StatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === 'audio/opus',
  )
  expect(sendrecv2AudioCodecStats).toBeDefined()

  const sendrecv2VideoCodecStats = sendrecv2StatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === `video/${sendrecv2VideoCodecType}`,
  )
  expect(sendrecv2VideoCodecStats).toBeDefined()

  const sendrecv2AudioOutboundRtpStats = sendrecv2StatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'audio',
  )
  expect(sendrecv2AudioOutboundRtpStats).toBeDefined()
  expect(sendrecv2AudioOutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(sendrecv2AudioOutboundRtpStats?.packetsSent).toBeGreaterThan(0)

  const sendrecv2VideoOutboundRtpStats = sendrecv2StatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video',
  )
  expect(sendrecv2VideoOutboundRtpStats).toBeDefined()
  expect(sendrecv2VideoOutboundRtpStats?.bytesSent).toBeGreaterThan(0)
  expect(sendrecv2VideoOutboundRtpStats?.packetsSent).toBeGreaterThan(0)

  const sendrecv2AudioInboundRtpStats = sendrecv2StatsReportJson.find(
    (stats) => stats.type === 'inbound-rtp' && stats.kind === 'audio',
  )
  expect(sendrecv2AudioInboundRtpStats).toBeDefined()
  expect(sendrecv2AudioInboundRtpStats?.bytesReceived).toBeGreaterThan(0)
  expect(sendrecv2AudioInboundRtpStats?.packetsReceived).toBeGreaterThan(0)

  const sendrecv2VideoInboundRtpStats = sendrecv2StatsReportJson.find(
    (stats) => stats.type === 'inbound-rtp' && stats.kind === 'video',
  )
  expect(sendrecv2VideoInboundRtpStats).toBeDefined()
  expect(sendrecv2VideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0)
  expect(sendrecv2VideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0)

  await sendrecv1.click('#disconnect')
  await sendrecv2.click('#disconnect')

  await sendrecv1.close()
  await sendrecv2.close()
})

// WebKit では scaleResolutionDownTo が反映されないため、このテストは fail する
test.fail('WebKit Authz simulcast_encodings ScaleResolutionDownTo', async ({ page }) => {
  await page.goto('http://localhost:9000/simulcast_sendonly_webkit/')

  const channelName = randomUUID()

  await page.fill('#channel-name', channelName)

  await page.fill(
    '#simulcast-encodings',
    JSON.stringify([
      {
        rid: 'r0',
        active: true,
        scaleResolutionDownTo: { width: 960, height: 540 },
        scalabilityMode: 'L1T1',
      },
      {
        rid: 'r1',
        active: true,
        scaleResolutionDownTo: { width: 960, height: 540 },
        scalabilityMode: 'L1T1',
      },
      { rid: 'r2', active: false },
    ]),
  )

  await page.click('#connect')

  await page.waitForSelector('#connection-id:not(:empty)')
  const connectionId = await page.$eval('#connection-id', (el) => el.textContent)
  console.log(`connectionId=${connectionId}`)

  await page.waitForTimeout(3000)

  await page.click('#get-stats')

  await page.click('#disconnect')

  // simulcast sendonly 統計情報
  const sendonlyStatsReportJson: Record<string, unknown>[] = await page.evaluate(() => {
    const statsReportDiv = document.querySelector<HTMLDivElement>('#stats-report')
    return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
  })

  const sendonlyVideoCodecStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'codec' && stats.mimeType === 'video/VP8',
  )
  expect(sendonlyVideoCodecStats).toBeDefined()

  const sendonlyVideoR0OutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r0',
  )
  expect(sendonlyVideoR0OutboundRtpStats).toBeDefined()
  expect(sendonlyVideoR0OutboundRtpStats?.bytesSent).toBeGreaterThan(500)
  expect(sendonlyVideoR0OutboundRtpStats?.packetsSent).toBeGreaterThan(50)
  // safari はなぜか scalabilityMode が取得できない
  // expect(sendonlyVideoR0OutboundRtpStats?.scalabilityMode).toEqual('L1T1')

  const sendonlyVideoR1OutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r1',
  )
  expect(sendonlyVideoR1OutboundRtpStats).toBeDefined()
  expect(sendonlyVideoR1OutboundRtpStats?.bytesSent).toBeGreaterThan(500)
  expect(sendonlyVideoR1OutboundRtpStats?.packetsSent).toBeGreaterThan(50)
  // safari はなぜか scalabilityMode が取得できない
  // expect(sendonlyVideoR0OutboundRtpStats?.scalabilityMode).toEqual('L1T1')

  const sendonlyVideoR2OutboundRtpStats = sendonlyStatsReportJson.find(
    (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r2',
  )
  expect(sendonlyVideoR2OutboundRtpStats).toBeDefined()
  expect(sendonlyVideoR2OutboundRtpStats?.bytesSent).toBe(0)
  expect(sendonlyVideoR2OutboundRtpStats?.packetsSent).toBeLessThanOrEqual(1)

  await page.close()
})
