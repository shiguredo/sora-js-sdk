import { expect, test } from '@playwright/test'
import { checkSoraVersion } from './helper'

/**
 * RPC機能のE2Eテスト
 *
 * 注意: このテストはSora JS SDK v2025.2.0-canary.0以降でのみ動作します。
 * RPC機能はこのバージョンで初めて導入されました。
 */
test.describe('RPC test', () => {
  test('2つのページ間でRPCのpush通知が送信される', async ({ browser }) => {
    // 2つの独立したブラウザコンテキストを作成
    // 各コンテキストは独立したCookie、localStorage等を持つため、
    // 完全に独立した2人のユーザーをシミュレートできる
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()
    const page1 = await context1.newPage()
    const page2 = await context2.newPage()

    try {
      // 両方のページでRPCテストページにアクセス
      await page1.goto('http://localhost:9000/rpc/')
      await page2.goto('http://localhost:9000/rpc/')

      // page1でバージョンチェック
      const versionCheck = await checkSoraVersion(page1, {
        majorVersion: 2025,
        minorVersion: 2,
        featureName: 'RPC',
      })

      if (!versionCheck.isSupported) {
        test.skip(true, versionCheck.skipReason || 'Version not supported')
        return
      }

      // 両方のページで接続を確立
      await page1.click('#connect')
      await page2.click('#connect')

      // 接続が確立されるまで待機（connection-idが表示されるまで）
      await page1.waitForSelector('#connection-id:not(:empty)', { timeout: 10000 })
      await page2.waitForSelector('#connection-id:not(:empty)', { timeout: 10000 })

      // リモートビデオが表示されるまで待機（お互いのビデオが見えていることを確認）
      await page1.waitForSelector('#remote-videos video', { timeout: 10000 })
      await page2.waitForSelector('#remote-videos video', { timeout: 10000 })

      // 接続が安定するまで少し待機
      await page1.waitForTimeout(1000)

      // RPCデータチャネルが確立されるまで待機
      await page1.waitForFunction(
        async () => {
          const getStatsButton = document.querySelector('#get-stats') as HTMLButtonElement
          if (getStatsButton) {
            getStatsButton.click()
            await new Promise((resolve) => setTimeout(resolve, 100))
            const statsDiv = document.querySelector('#stats-report') as HTMLElement
            const statsJson = statsDiv?.dataset.statsReportJson
            if (statsJson) {
              const stats = JSON.parse(statsJson)
              return stats.some(
                (report: any) =>
                  report.type === 'data-channel' &&
                  report.label === 'rpc' &&
                  report.state === 'open',
              )
            }
          }
          return false
        },
        { timeout: 10000 },
      )

      await page2.waitForFunction(
        async () => {
          const getStatsButton = document.querySelector('#get-stats') as HTMLButtonElement
          if (getStatsButton) {
            getStatsButton.click()
            await new Promise((resolve) => setTimeout(resolve, 100))
            const statsDiv = document.querySelector('#stats-report') as HTMLElement
            const statsJson = statsDiv?.dataset.statsReportJson
            if (statsJson) {
              const stats = JSON.parse(statsJson)
              return stats.some(
                (report: any) =>
                  report.type === 'data-channel' &&
                  report.label === 'rpc' &&
                  report.state === 'open',
              )
            }
          }
          return false
        },
        { timeout: 10000 },
      )

      // 統計情報を取得して接続が正常であることを確認
      await page1.click('#get-stats')
      await page1.waitForSelector('#stats-report:not(:empty)', { timeout: 5000 })

      const statsReportJson = await page1.evaluate(() => {
        const statsDiv = document.querySelector('#stats-report') as HTMLElement
        return statsDiv?.dataset.statsReportJson
      })

      expect(statsReportJson).toBeTruthy()
      const stats = JSON.parse(statsReportJson || '[]') as Array<Record<string, unknown>>

      // 接続が確立されていることを確認
      const hasInboundRtp = stats.some((report) => report.type === 'inbound-rtp')
      const hasOutboundRtp = stats.some((report) => report.type === 'outbound-rtp')
      expect(hasInboundRtp).toBe(true)
      expect(hasOutboundRtp).toBe(true)

      // RPCデータチャネルが存在することを確認（page1）
      console.log('Page1 stats reports:', stats.length)
      const dataChannels1 = stats.filter((report) => report.type === 'data-channel')
      console.log(
        'Page1 data channels:',
        dataChannels1.map((dc) => ({ label: dc.label, state: dc.state })),
      )

      const hasRpcDataChannel1 = stats.some(
        (report) => report.type === 'data-channel' && report.label === 'rpc',
      )
      expect(hasRpcDataChannel1).toBe(true)

      // page2でも統計情報を取得してRPCデータチャネルを確認
      await page2.click('#get-stats')
      await page2.waitForSelector('#stats-report:not(:empty)', { timeout: 5000 })

      const statsReportJson2 = await page2.evaluate(() => {
        const statsDiv = document.querySelector('#stats-report') as HTMLElement
        return statsDiv?.dataset.statsReportJson
      })

      expect(statsReportJson2).toBeTruthy()
      const stats2 = JSON.parse(statsReportJson2 || '[]') as Array<Record<string, unknown>>

      // RPCデータチャネルが存在することを確認（page2）
      console.log('Page2 stats reports:', stats2.length)
      const dataChannels2 = stats2.filter((report) => report.type === 'data-channel')
      console.log(
        'Page2 data channels:',
        dataChannels2.map((dc) => ({ label: dc.label, state: dc.state })),
      )

      const hasRpcDataChannel2 = stats2.some(
        (report) => report.type === 'data-channel' && report.label === 'rpc',
      )
      expect(hasRpcDataChannel2).toBe(true)

      // page2のpush-resultをクリアして、クリアされたことを確認
      await page2.evaluate(() => {
        const pushResult = document.querySelector('#push-result')
        if (pushResult) pushResult.innerHTML = ''
      })

      // クリアが完了したことを確認
      await page2.waitForFunction(
        () => {
          const pushResult = document.querySelector('#push-result')
          return pushResult && pushResult.innerHTML === ''
        },
        { timeout: 5000 },
      )

      // 少し待機してから新しいpush通知を待つ
      await page2.waitForTimeout(500)

      // page1でRPCを実行
      await page1.fill('#rpc-input', 'test-value-from-page1')
      await page1.click('#rpc-button')

      // page1でRPCが正常に送信されたことを確認
      await page1.waitForFunction(
        () => {
          const result = document.querySelector('#rpc-result')
          return result && result.textContent === 'RPC sent successfully'
        },
        { timeout: 5000 },
      )

      // page2で新しいpush通知（test-value-from-page1を含む）を待つ
      await page2.waitForFunction(
        () => {
          const pushResult = document.querySelector('#push-result')
          if (!pushResult) return false

          const valueP = Array.from(pushResult.querySelectorAll('p')).find((p) => {
            const text = p.textContent || ''
            return text.startsWith('Value: ')
          })

          return valueP && valueP.textContent === 'Value: test-value-from-page1'
        },
        { timeout: 10000 },
      )

      // push通知の内容を検証
      const pushContent = await page2.evaluate(() => {
        const pushResult = document.querySelector('#push-result')
        if (!pushResult) return null

        const data: Record<string, string> = {}
        pushResult.querySelectorAll('p').forEach((p) => {
          const text = p.textContent || ''
          const [key, value] = text.split(': ')
          if (key && value) {
            data[key.toLowerCase()] = value
          }
        })
        return data
      })

      expect(pushContent).toBeTruthy()
      expect(pushContent?.action).toBe('PutMetadataItem')
      expect(pushContent?.key).toBe('abc')
      expect(pushContent?.value).toBe('test-value-from-page1')
      expect(pushContent?.type).toBe('signaling_notify_metadata_ext')

      // RPCメッセージが完全に処理されるまで待機
      await page1.waitForTimeout(500)

      // 逆方向のテスト: page2からpage1へ
      // push-resultをクリアして、クリアされたことを確認
      await page1.evaluate(() => {
        const pushResult = document.querySelector('#push-result')
        if (pushResult) pushResult.innerHTML = ''
      })

      // クリアが完了したことを確認
      await page1.waitForFunction(
        () => {
          const pushResult = document.querySelector('#push-result')
          return pushResult && pushResult.innerHTML === ''
        },
        { timeout: 5000 },
      )

      // 少し待機してから新しいpush通知を待つ
      await page1.waitForTimeout(500)

      await page2.fill('#rpc-input', 'test-value-from-page2')
      await page2.click('#rpc-button')

      await page2.waitForFunction(
        () => {
          const result = document.querySelector('#rpc-result')
          return result && result.textContent === 'RPC sent successfully'
        },
        { timeout: 5000 },
      )

      // page1で新しいpush通知（test-value-from-page2を含む）を待つ
      await page1.waitForFunction(
        () => {
          const pushResult = document.querySelector('#push-result')
          if (!pushResult) return false

          const valueP = Array.from(pushResult.querySelectorAll('p')).find((p) => {
            const text = p.textContent || ''
            return text.startsWith('Value: ')
          })

          return valueP && valueP.textContent === 'Value: test-value-from-page2'
        },
        { timeout: 10000 },
      )

      const pushContent2 = await page1.evaluate(() => {
        const pushResult = document.querySelector('#push-result')
        if (!pushResult) return null

        const data: Record<string, string> = {}
        pushResult.querySelectorAll('p').forEach((p) => {
          const text = p.textContent || ''
          const [key, value] = text.split(': ')
          if (key && value) {
            data[key.toLowerCase()] = value
          }
        })
        return data
      })

      expect(pushContent2).toBeTruthy()
      expect(pushContent2?.value).toBe('test-value-from-page2')

      // RPC送信後に統計情報を再取得して、メッセージが送受信されたことを確認
      await page1.waitForTimeout(1000) // RPCが完了するまで待機
      await page1.click('#get-stats')
      await page1.waitForTimeout(500) // 統計情報が更新されるまで少し待機

      const statsAfterRpc1 = await page1.evaluate(() => {
        const statsDiv = document.querySelector('#stats-report') as HTMLElement
        return statsDiv?.dataset.statsReportJson
      })

      const statsAfter1 = JSON.parse(statsAfterRpc1 || '[]') as Array<Record<string, unknown>>
      const rpcDataChannel1 = statsAfter1.find(
        (report) => report.type === 'data-channel' && report.label === 'rpc',
      )

      // page1では両方向でメッセージが送受信されているはず
      expect(rpcDataChannel1).toBeTruthy()
      console.log('Page1 RPC DataChannel stats:', rpcDataChannel1)
      expect(Number(rpcDataChannel1?.messagesSent || 0)).toBeGreaterThan(0)
      expect(Number(rpcDataChannel1?.bytesSent || 0)).toBeGreaterThan(0)
      // RPCがnotificationモードの場合、レスポンスがないのでmessagesReceivedは0かもしれない

      // page2でも統計情報を再取得
      await page2.click('#get-stats')
      await page2.waitForTimeout(500)

      const statsAfterRpc2 = await page2.evaluate(() => {
        const statsDiv = document.querySelector('#stats-report') as HTMLElement
        return statsDiv?.dataset.statsReportJson
      })

      const statsAfter2 = JSON.parse(statsAfterRpc2 || '[]') as Array<Record<string, unknown>>
      const rpcDataChannel2 = statsAfter2.find(
        (report) => report.type === 'data-channel' && report.label === 'rpc',
      )

      // page2でも両方向でメッセージが送受信されているはず
      expect(rpcDataChannel2).toBeTruthy()
      console.log('Page2 RPC DataChannel stats:', rpcDataChannel2)
      expect(Number(rpcDataChannel2?.messagesSent || 0)).toBeGreaterThan(0)
      expect(Number(rpcDataChannel2?.bytesSent || 0)).toBeGreaterThan(0)
      // page2はpage1からのRPCメッセージを受信していないはず（push通知は別の仕組み）
    } finally {
      // 両方のページで切断
      await page1.click('#disconnect')
      await page2.click('#disconnect')

      // クリーンアップ
      await page1.close()
      await page2.close()
      await context1.close()
      await context2.close()
    }
  })
})
