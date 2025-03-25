import { randomUUID } from 'node:crypto'
import { platform } from 'node:os'
import { expect, test } from '@playwright/test'

// H.265 は HWA のみの対応なので環境依存
// for (const videoCodecType of ['AV1', 'H264', 'H265']) {
for (const videoCodecType of ['AV1', 'H264']) {
  test(`whip/whep/${videoCodecType}`, async ({ browser }) => {
    // ブラウザのバージョンを取得
    const browserName = browser.browserType().name()
    const browserVersion = browser.version()
    console.log(`browser name=${browserName} version=${browserVersion}`)

    test.skip(
      test.info().project.name.includes('Edge') && videoCodecType.startsWith('H'),
      'Edge の場合は H264/H265 のテストはスキップする',
    )

    test.skip(
      process.env.NPM_PKG_E2E_TEST === 'true',
      'NPM パッケージの E2E テストでは WHIP/WHEP 関連のテストはスキップする',
    )

    const whip = await browser.newPage()
    const whep = await browser.newPage()

    await whip.goto('http://localhost:9000/whip/')
    await whep.goto('http://localhost:9000/whep/')

    await whip.selectOption('#video-codec-type', videoCodecType)
    // コーデックの取得
    const whipVideoCodecType = await whip.evaluate(() => {
      const videoElement = document.querySelector('#video-codec-type') as HTMLSelectElement
      return videoElement.value
    })
    console.log(`whipVideoCodecType=${whipVideoCodecType}`)

    await whep.selectOption('#video-codec-type', videoCodecType)
    // コーデックの取得
    const whepVideoCodecType = await whep.evaluate(() => {
      const videoElement = document.querySelector('#video-codec-type') as HTMLSelectElement
      return videoElement.value
    })
    console.log(`whepVideoCodecType=${whepVideoCodecType}`)

    // チャンネル名を uuid 文字列にする
    const channelName = randomUUID()

    // チャンネル名を設定
    await whip.fill('#channel-name', channelName)
    await whep.fill('#channel-name', channelName)

    await whip.click('#connect')
    await whep.click('#connect')

    // connection-stateが"connected"になるまで待つ
    await whip.waitForSelector('#connection-state:has-text("connected")')
    await whep.waitForSelector('#connection-state:has-text("connected")')

    // connection-stateの値を取得して確認
    const whipConnectionState = await whip.$eval('#connection-state', (el) => el.textContent)
    console.log(`whip connectionState=${whipConnectionState}`)

    const whepConnectionState = await whep.$eval('#connection-state', (el) => el.textContent)
    console.log(`whep connectionState=${whepConnectionState}`)

    // レース対策
    await whip.waitForTimeout(3000)
    await whep.waitForTimeout(3000)

    // 'Get Stats' ボタンをクリックして統計情報を取得
    await whip.click('#get-stats')
    await whep.click('#get-stats')

    // 統計情報が表示されるまで待機
    await whip.waitForSelector('#stats-report')
    await whep.waitForSelector('#stats-report')

    // 統計情報を取得
    const whipStatsReportJson: Record<string, unknown>[] = await whip.evaluate(() => {
      const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
      return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
    })
    // whip video codec
    const whipVideoCodecStats = whipStatsReportJson.find(
      (stats) => stats.type === 'codec' && stats.mimeType === `video/${videoCodecType}`,
    )
    expect(whipVideoCodecStats).toBeDefined()

    // whip video outbound-rtp
    const whipVideoOutboundRtpStats = whipStatsReportJson.find(
      (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video',
    )
    expect(whipVideoOutboundRtpStats).toBeDefined()
    expect(whipVideoOutboundRtpStats?.bytesSent).toBeGreaterThan(0)
    expect(whipVideoOutboundRtpStats?.packetsSent).toBeGreaterThan(0)

    // データセットから統計情報を取得
    const whepStatsReportJson: Record<string, unknown>[] = await whep.evaluate(() => {
      const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
      return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
    })

    // whep video codec
    const whepVideoCodecStats = whepStatsReportJson.find(
      (stats) => stats.type === 'codec' && stats.mimeType === `video/${videoCodecType}`,
    )
    expect(whepVideoCodecStats).toBeDefined()

    // whep video inbound-rtp
    const whepVideoInboundRtpStats = whepStatsReportJson.find(
      (stats) => stats.type === 'inbound-rtp' && stats.kind === 'video',
    )
    expect(whepVideoInboundRtpStats).toBeDefined()
    expect(whepVideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0)
    expect(whepVideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0)

    await whip.click('#disconnect')
    await whep.click('#disconnect')

    await whip.close()
    await whep.close()
  })
}
