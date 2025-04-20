import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

for (const videoCodecType of ['AV1', 'H264', 'H265']) {
  test(`whip-simulcast/${videoCodecType}`, async ({ browser }) => {
    test.skip(
      process.env.E2E_TEST_WISH !== 'true',
      'E2E_TEST_WISH が true でない場合は WHIP/WHEP 関連のテストはスキップする',
    )

    // Google Chrome (m136) になったらこの skip は削除する
    test.skip(
      test.info().project.name === 'Google Chrome' && videoCodecType === 'H265',
      'Google Chrome (m135) では H.265 に対応していないのでスキップします',
    )

    // ブラウザのバージョンを取得
    const browserName = browser.browserType().name()
    const browserVersion = browser.version()
    console.log(`browser name=${browserName} version=${browserVersion}`)

    const page = await browser.newPage()

    await page.goto('http://localhost:9000/whip_simulcast/')

    const channelName = randomUUID()

    await page.fill('#channel-name', channelName)

    await page.selectOption('#video-codec-type', videoCodecType)

    await page.click('#connect')

    // 安全によせて 5 秒待つ
    await page.waitForTimeout(5000)

    // connection-state が "connected" になるまで待つ
    await page.waitForSelector('#connection-state:has-text("connected")')

    // connection-stateの値を取得して確認
    const whipConnectionState = await page.$eval('#connection-state', (el) => el.textContent)
    console.log(`whip connectionState=${whipConnectionState}`)

    // 'Get Stats' ボタンをクリックして統計情報を取得
    await page.click('#get-stats')

    // 統計情報が表示されるまで待機
    await page.waitForSelector('#stats-report')
    // データセットから統計情報を取得
    const statsReportJson: Record<string, unknown>[] = await page.evaluate(() => {
      const statsReportDiv = document.querySelector('#stats-report') as HTMLDivElement
      return statsReportDiv ? JSON.parse(statsReportDiv.dataset.statsReportJson || '[]') : []
    })

    // sendonly stats report
    const videoCodecStats = statsReportJson.find(
      (stats) => stats.type === 'codec' && stats.mimeType === `video/${videoCodecType}`,
    )
    expect(videoCodecStats).toBeDefined()

    const videoR0OutboundRtpStats = statsReportJson.find(
      (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r0',
    )
    expect(videoR0OutboundRtpStats).toBeDefined()

    const videoR1OutboundRtpStats = statsReportJson.find(
      (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r1',
    )
    expect(videoR1OutboundRtpStats).toBeDefined()

    const videoR2OutboundRtpStats = statsReportJson.find(
      (stats) => stats.type === 'outbound-rtp' && stats.kind === 'video' && stats.rid === 'r2',
    )
    expect(videoR2OutboundRtpStats).toBeDefined()

    await page.click('#disconnect')

    // disconnected になるまで待つ
    // await page.waitForSelector('#connection-state:has-text("disconnected")')

    // ページを閉じる
    await page.close()
  })
}
