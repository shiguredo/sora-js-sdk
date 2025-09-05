import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test.describe('Stereo Audio SendRecv Tests', () => {
  test.beforeEach(async ({ page, browser, browserName }) => {
    // ブラウザ情報をログ出力
    const browserVersion = browser.version()
    const userAgent = await page.evaluate(() => navigator.userAgent)
    console.log(`Browser: ${browserName} ${browserVersion}`)
    console.log(`User Agent: ${userAgent}`)

    // ページに移動してSora JS SDKのバージョンを確認
    await page.goto('http://localhost:9000/fake_stereo_audio_sendrecv/')

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

  test('stereo audio bidirectional transmission test', async ({ browser }) => {
    // 新しいページを作成
    const page = await browser.newPage()

    // ページに移動
    await page.goto('http://localhost:9000/fake_stereo_audio_sendrecv/')

    // チャネル名を uuid で生成する
    const channelName = randomUUID()

    await page.fill('#channel-name', channelName)

    // 両方の接続でステレオを有効にして接続
    await page.check('#use-stereo-1')
    await page.check('#use-stereo-2')
    await page.check('#force-stereo-output-1')
    await page.check('#force-stereo-output-2')
    await page.click('#connect')

    // 両方のconnection-idが表示されるまで待つ
    await page.waitForSelector('#connection-id-1:not(:empty)')
    await page.waitForSelector('#connection-id-2:not(:empty)')

    const connectionId1 = await page.$eval('#connection-id-1', (el) => el.textContent)
    const connectionId2 = await page.$eval('#connection-id-2', (el) => el.textContent)

    console.log(`connection-1 connectionId=${connectionId1}`)
    console.log(`connection-2 connectionId=${connectionId2}`)

    // レース対策
    await page.waitForTimeout(3000)

    // 'Get Stats' ボタンをクリックして統計情報を取得
    await page.click('#get-stats')
    // 統計情報が表示されるまで待機
    await page.waitForSelector('#stats-report-1')
    await page.waitForSelector('#stats-report-2')

    // 接続1の統計情報を取得
    const stats1Json: Record<string, unknown>[] = await page.evaluate(() => {
      const statsDiv = document.querySelector('#stats-report-1') as HTMLDivElement
      return statsDiv ? JSON.parse(statsDiv.dataset.statsReportJson || '[]') : []
    })

    // 接続2の統計情報を取得
    const stats2Json: Record<string, unknown>[] = await page.evaluate(() => {
      const statsDiv = document.querySelector('#stats-report-2') as HTMLDivElement
      return statsDiv ? JSON.parse(statsDiv.dataset.statsReportJson || '[]') : []
    })

    // 接続1：音声が正常に送受信できているかを確認
    const conn1AudioOutboundRtp = stats1Json.find(
      (report) => report.type === 'outbound-rtp' && report.kind === 'audio',
    )
    expect(conn1AudioOutboundRtp).toBeDefined()
    expect(conn1AudioOutboundRtp?.bytesSent).toBeGreaterThan(0)
    expect(conn1AudioOutboundRtp?.packetsSent).toBeGreaterThan(0)

    const conn1AudioInboundRtp = stats1Json.find(
      (report) => report.type === 'inbound-rtp' && report.kind === 'audio',
    )
    expect(conn1AudioInboundRtp).toBeDefined()
    expect(conn1AudioInboundRtp?.bytesReceived).toBeGreaterThan(0)
    expect(conn1AudioInboundRtp?.packetsReceived).toBeGreaterThan(0)

    // 接続2：音声が正常に送受信できているかを確認
    const conn2AudioOutboundRtp = stats2Json.find(
      (report) => report.type === 'outbound-rtp' && report.kind === 'audio',
    )
    expect(conn2AudioOutboundRtp).toBeDefined()
    expect(conn2AudioOutboundRtp?.bytesSent).toBeGreaterThan(0)
    expect(conn2AudioOutboundRtp?.packetsSent).toBeGreaterThan(0)

    const conn2AudioInboundRtp = stats2Json.find(
      (report) => report.type === 'inbound-rtp' && report.kind === 'audio',
    )
    expect(conn2AudioInboundRtp).toBeDefined()
    expect(conn2AudioInboundRtp?.bytesReceived).toBeGreaterThan(0)
    expect(conn2AudioInboundRtp?.packetsReceived).toBeGreaterThan(0)

    // 音声分析結果を取得
    const analysisData = await page.evaluate(() => {
      const analysisDiv = document.querySelector('#audio-analysis') as HTMLDivElement
      return analysisDiv ? JSON.parse(analysisDiv.dataset.analysis || '{}') : {}
    })

    console.log('Stereo sendrecv test - Audio analysis:', analysisData)

    // 接続1のローカル（送信側）のステレオ検証（440Hz基準）
    expect(analysisData.connection1.local.channelCount).toBeGreaterThanOrEqual(2)
    expect(analysisData.connection1.local.isStereo).toBe(true)
    expect(analysisData.connection1.local.leftFrequency).toBeGreaterThan(400)
    expect(analysisData.connection1.local.leftFrequency).toBeLessThan(480)
    expect(analysisData.connection1.local.rightFrequency).toBeGreaterThan(600)
    expect(analysisData.connection1.local.rightFrequency).toBeLessThan(700)

    // 接続1のリモート（接続2から受信）のステレオ検証（880Hz基準）
    expect(analysisData.connection1.remote.channelCount).toBeGreaterThanOrEqual(2)
    expect(analysisData.connection1.remote.isStereo).toBe(true)
    expect(analysisData.connection1.remote.leftFrequency).toBeGreaterThan(840)
    expect(analysisData.connection1.remote.leftFrequency).toBeLessThan(920)
    expect(analysisData.connection1.remote.rightFrequency).toBeGreaterThan(1200)
    expect(analysisData.connection1.remote.rightFrequency).toBeLessThan(1400)

    // 接続2のローカル（送信側）のステレオ検証（880Hz基準）
    expect(analysisData.connection2.local.channelCount).toBeGreaterThanOrEqual(2)
    expect(analysisData.connection2.local.isStereo).toBe(true)
    expect(analysisData.connection2.local.leftFrequency).toBeGreaterThan(840)
    expect(analysisData.connection2.local.leftFrequency).toBeLessThan(920)
    expect(analysisData.connection2.local.rightFrequency).toBeGreaterThan(1200)
    expect(analysisData.connection2.local.rightFrequency).toBeLessThan(1400)

    // 接続2のリモート（接続1から受信）のステレオ検証（440Hz基準）
    expect(analysisData.connection2.remote.channelCount).toBeGreaterThanOrEqual(2)
    expect(analysisData.connection2.remote.isStereo).toBe(true)
    expect(analysisData.connection2.remote.leftFrequency).toBeGreaterThan(400)
    expect(analysisData.connection2.remote.leftFrequency).toBeLessThan(480)
    expect(analysisData.connection2.remote.rightFrequency).toBeGreaterThan(600)
    expect(analysisData.connection2.remote.rightFrequency).toBeLessThan(700)

    await page.click('#disconnect')
    await page.close()
  })

  test('mono audio bidirectional transmission test', async ({ browser }) => {
    // 新しいページを作成
    const page = await browser.newPage()

    // ページに移動
    await page.goto('http://localhost:9000/fake_stereo_audio_sendrecv/')

    // チャネル名を uuid で生成する
    const channelName = randomUUID()

    await page.fill('#channel-name', channelName)

    // 両方の接続でモノラルに設定して接続
    await page.uncheck('#use-stereo-1')
    await page.uncheck('#use-stereo-2')
    await page.uncheck('#force-stereo-output-1')
    await page.uncheck('#force-stereo-output-2')
    await page.click('#connect')

    // 両方のconnection-idが表示されるまで待つ
    await page.waitForSelector('#connection-id-1:not(:empty)')
    await page.waitForSelector('#connection-id-2:not(:empty)')

    const connectionId1 = await page.$eval('#connection-id-1', (el) => el.textContent)
    const connectionId2 = await page.$eval('#connection-id-2', (el) => el.textContent)

    console.log(`connection-1 connectionId=${connectionId1}`)
    console.log(`connection-2 connectionId=${connectionId2}`)

    // レース対策
    await page.waitForTimeout(3000)

    // 'Get Stats' ボタンをクリックして統計情報を取得
    await page.click('#get-stats')
    // 統計情報が表示されるまで待機
    await page.waitForSelector('#stats-report-1')
    await page.waitForSelector('#stats-report-2')

    // 音声分析結果を取得
    const analysisData = await page.evaluate(() => {
      const analysisDiv = document.querySelector('#audio-analysis') as HTMLDivElement
      return analysisDiv ? JSON.parse(analysisDiv.dataset.analysis || '{}') : {}
    })

    console.log('Mono sendrecv test - Audio analysis:', analysisData)

    // 接続1のローカル（送信側）のモノラル検証（440Hz基準）
    expect(analysisData.connection1.local.isStereo).toBe(false)
    expect(analysisData.connection1.local.leftFrequency).toBeGreaterThan(400)
    expect(analysisData.connection1.local.leftFrequency).toBeLessThan(480)
    expect(
      Math.abs(
        analysisData.connection1.local.leftFrequency -
          analysisData.connection1.local.rightFrequency,
      ),
    ).toBeLessThan(10)

    // 接続1のリモート（接続2から受信）のモノラル検証（880Hz基準）
    expect(analysisData.connection1.remote.isStereo).toBe(false)
    expect(analysisData.connection1.remote.leftFrequency).toBeGreaterThan(840)
    expect(analysisData.connection1.remote.leftFrequency).toBeLessThan(920)
    expect(
      Math.abs(
        analysisData.connection1.remote.leftFrequency -
          analysisData.connection1.remote.rightFrequency,
      ),
    ).toBeLessThan(10)

    // 接続2のローカル（送信側）のモノラル検証（880Hz基準）
    expect(analysisData.connection2.local.isStereo).toBe(false)
    expect(analysisData.connection2.local.leftFrequency).toBeGreaterThan(840)
    expect(analysisData.connection2.local.leftFrequency).toBeLessThan(920)
    expect(
      Math.abs(
        analysisData.connection2.local.leftFrequency -
          analysisData.connection2.local.rightFrequency,
      ),
    ).toBeLessThan(10)

    // 接続2のリモート（接続1から受信）のモノラル検証（440Hz基準）
    expect(analysisData.connection2.remote.isStereo).toBe(false)
    expect(analysisData.connection2.remote.leftFrequency).toBeGreaterThan(400)
    expect(analysisData.connection2.remote.leftFrequency).toBeLessThan(480)
    expect(
      Math.abs(
        analysisData.connection2.remote.leftFrequency -
          analysisData.connection2.remote.rightFrequency,
      ),
    ).toBeLessThan(10)

    await page.click('#disconnect')
    await page.close()
  })

  test('mixed stereo/mono bidirectional transmission test', async ({ browser }) => {
    // 新しいページを作成
    const page = await browser.newPage()

    // ページに移動
    await page.goto('http://localhost:9000/fake_stereo_audio_sendrecv/')

    // チャネル名を uuid で生成する
    const channelName = randomUUID()

    await page.fill('#channel-name', channelName)

    // 接続1はステレオ、接続2はモノラルに設定
    // ただし、接続2もforceStereoOutputを有効にして、接続1からのステレオ音声を正しく受信できるようにする
    await page.check('#use-stereo-1')
    await page.check('#force-stereo-output-1')
    await page.uncheck('#use-stereo-2')
    await page.check('#force-stereo-output-2')
    await page.click('#connect')

    // 両方のconnection-idが表示されるまで待つ
    await page.waitForSelector('#connection-id-1:not(:empty)')
    await page.waitForSelector('#connection-id-2:not(:empty)')

    // レース対策
    await page.waitForTimeout(3000)

    // 'Get Stats' ボタンをクリックして統計情報を取得
    await page.click('#get-stats')
    await page.waitForSelector('#stats-report-1')

    // 音声分析結果を取得
    const analysisData = await page.evaluate(() => {
      const analysisDiv = document.querySelector('#audio-analysis') as HTMLDivElement
      return analysisDiv ? JSON.parse(analysisDiv.dataset.analysis || '{}') : {}
    })

    console.log('Mixed stereo/mono test - Audio analysis:', analysisData)

    // 接続1のローカルはステレオ
    expect(analysisData.connection1.local.isStereo).toBe(true)

    // 接続1のリモート（接続2から受信）はモノラル
    expect(analysisData.connection1.remote.isStereo).toBe(false)

    // 接続2のローカルはモノラル
    expect(analysisData.connection2.local.isStereo).toBe(false)

    // 接続2のリモート（接続1から受信）はステレオ
    expect(analysisData.connection2.remote.isStereo).toBe(true)

    await page.click('#disconnect')
    await page.close()
  })
})
