import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test.describe('Stereo Audio Tests', () => {
  test.beforeEach(async ({ page, browser, browserName }) => {
    // ブラウザ情報をログ出力
    const browserVersion = browser.version()
    const userAgent = await page.evaluate(() => navigator.userAgent)
    console.log(`Browser: ${browserName} ${browserVersion}`)
    console.log(`User Agent: ${userAgent}`)

    // ページに移動してSora JS SDKのバージョンを確認
    await page.goto('http://localhost:9000/fake_stereo_audio/')

    // Sora.version()を実行してバージョンを取得
    const version = await page.evaluate(() => {
      // @ts-expect-error
      return window.Sora ? window.Sora.version() : null
    })

    if (!version) {
      // バージョンが取得できない場合はスキップ
      test.skip(true, 'Sora JS SDK version not found')
      return
    }

    // バージョンをパース（例: "2024.1.0" -> [2024, 1, 0]）
    const versionParts = version.split('.').map((v: string) => Number.parseInt(v, 10))
    const majorVersion = versionParts[0] || 0
    const minorVersion = versionParts[1] || 0

    // 2024.2以降でない場合はスキップ
    if (majorVersion < 2024 || (majorVersion === 2024 && minorVersion < 2)) {
      test.skip(true, `Sora JS SDK version ${version} is older than 2024.2`)
    }
  })

  test('stereo audio transmission test', async ({ browser }) => {
    // 新しいページを作成
    const page = await browser.newPage()

    // ページに移動
    await page.goto('http://localhost:9000/fake_stereo_audio/')

    // チャネル名を uuid で生成する
    const channelName = randomUUID()

    await page.fill('#channel-name', channelName)

    // ステレオを有効にして接続
    await page.check('#use-stereo')
    await page.click('#connect')

    // 両方のconnection-idが表示されるまで待つ
    await page.waitForSelector('#sendonly-connection-id:not(:empty)')
    await page.waitForSelector('#recvonly-connection-id:not(:empty)')

    const sendonlyConnectionId = await page.$eval('#sendonly-connection-id', (el) => el.textContent)
    const recvonlyConnectionId = await page.$eval('#recvonly-connection-id', (el) => el.textContent)

    console.log(`sendonly connectionId=${sendonlyConnectionId}`)
    console.log(`recvonly connectionId=${recvonlyConnectionId}`)

    // レース対策
    await page.waitForTimeout(3000)

    // 'Get Stats' ボタンをクリックして統計情報を取得
    await page.click('#get-stats')
    // 統計情報が表示されるまで待機
    await page.waitForSelector('#stats-report')

    // 送信側の統計情報を取得
    const sendStatsReportJson: Record<string, unknown>[] = await page.evaluate(() => {
      const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
      return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
    })

    // 受信側の統計情報を取得
    const recvStatsReportJson: Record<string, unknown>[] = await page.evaluate(() => {
      const recvStatsDiv = document.querySelector('[data-recv-stats-report-json]') as HTMLDivElement
      return recvStatsDiv ? JSON.parse(recvStatsDiv.dataset.recvStatsReportJson || '[]') : []
    })

    // 送信側：音声が正常に送れているかを確認
    const sendAudioOutboundRtp = sendStatsReportJson.find(
      (report) => report.type === 'outbound-rtp' && report.kind === 'audio',
    )
    expect(sendAudioOutboundRtp).toBeDefined()
    expect(sendAudioOutboundRtp?.bytesSent).toBeGreaterThan(0)
    expect(sendAudioOutboundRtp?.packetsSent).toBeGreaterThan(0)

    // 受信側：音声が正常に受信できているかを確認
    const recvAudioInboundRtp = recvStatsReportJson.find(
      (report) => report.type === 'inbound-rtp' && report.kind === 'audio',
    )
    expect(recvAudioInboundRtp).toBeDefined()
    expect(recvAudioInboundRtp?.bytesReceived).toBeGreaterThan(0)
    expect(recvAudioInboundRtp?.packetsReceived).toBeGreaterThan(0)

    // 音声分析結果を取得
    const analysisData = await page.evaluate(() => {
      const analysisDiv = document.querySelector('#audio-analysis') as HTMLDivElement
      return analysisDiv ? JSON.parse(analysisDiv.dataset.analysis || '{}') : {}
    })

    console.log('Stereo test - Audio analysis:', analysisData)

    // ローカル（送信側）のステレオ検証
    expect(analysisData.local.channelCount).toBeGreaterThanOrEqual(2)
    expect(analysisData.local.isStereo).toBe(true)
    expect(analysisData.local.leftFrequency).toBeGreaterThan(400)
    expect(analysisData.local.leftFrequency).toBeLessThan(480)
    expect(analysisData.local.rightFrequency).toBeGreaterThan(600)
    expect(analysisData.local.rightFrequency).toBeLessThan(700)

    // リモート（受信側）のステレオ検証
    expect(analysisData.remote.channelCount).toBeGreaterThanOrEqual(2)
    expect(analysisData.remote.isStereo).toBe(true)
    expect(analysisData.remote.leftFrequency).toBeGreaterThan(400)
    expect(analysisData.remote.leftFrequency).toBeLessThan(480)
    expect(analysisData.remote.rightFrequency).toBeGreaterThan(600)
    expect(analysisData.remote.rightFrequency).toBeLessThan(700)

    await page.click('#disconnect')
    await page.close()
  })

  test('mono audio transmission test', async ({ browser }) => {
    // 新しいページを作成
    const page = await browser.newPage()

    // ページに移動
    await page.goto('http://localhost:9000/fake_stereo_audio/')

    // チャネル名を uuid で生成する
    const channelName = randomUUID()

    await page.fill('#channel-name', channelName)

    // モノラルに設定して接続
    await page.uncheck('#use-stereo')
    await page.click('#connect')

    // 両方のconnection-idが表示されるまで待つ
    await page.waitForSelector('#sendonly-connection-id:not(:empty)')
    await page.waitForSelector('#recvonly-connection-id:not(:empty)')

    const sendonlyConnectionId = await page.$eval('#sendonly-connection-id', (el) => el.textContent)
    const recvonlyConnectionId = await page.$eval('#recvonly-connection-id', (el) => el.textContent)

    console.log(`sendonly connectionId=${sendonlyConnectionId}`)
    console.log(`recvonly connectionId=${recvonlyConnectionId}`)

    // レース対策
    await page.waitForTimeout(3000)

    // 'Get Stats' ボタンをクリックして統計情報を取得
    await page.click('#get-stats')
    // 統計情報が表示されるまで待機
    await page.waitForSelector('#stats-report')

    // 送信側の統計情報を取得
    const sendStatsReportJson: Record<string, unknown>[] = await page.evaluate(() => {
      const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
      return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
    })

    // 音声が正常に送れているかを確認
    const sendAudioOutboundRtp = sendStatsReportJson.find(
      (report) => report.type === 'outbound-rtp' && report.kind === 'audio',
    )
    expect(sendAudioOutboundRtp).toBeDefined()
    expect(sendAudioOutboundRtp?.bytesSent).toBeGreaterThan(0)
    expect(sendAudioOutboundRtp?.packetsSent).toBeGreaterThan(0)

    // 音声分析結果を取得
    const analysisData = await page.evaluate(() => {
      const analysisDiv = document.querySelector('#audio-analysis') as HTMLDivElement
      return analysisDiv ? JSON.parse(analysisDiv.dataset.analysis || '{}') : {}
    })

    console.log('Mono test - Audio analysis:', analysisData)

    // ローカル（送信側）のモノラル検証
    expect(analysisData.local.isStereo).toBe(false)
    expect(analysisData.local.leftFrequency).toBeGreaterThan(400)
    expect(analysisData.local.leftFrequency).toBeLessThan(480)
    expect(
      Math.abs(analysisData.local.leftFrequency - analysisData.local.rightFrequency),
    ).toBeLessThan(10)

    // リモート（受信側）のモノラル検証
    expect(analysisData.remote.isStereo).toBe(false)
    expect(analysisData.remote.leftFrequency).toBeGreaterThan(400)
    expect(analysisData.remote.leftFrequency).toBeLessThan(480)
    expect(
      Math.abs(analysisData.remote.leftFrequency - analysisData.remote.rightFrequency),
    ).toBeLessThan(10)

    await page.click('#disconnect')
    await page.close()
  })
})
