import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { checkSoraVersion } from './helper'

/**
 * RPC 機能の E2E テスト
 *
 * 注意: このテストは Sora JS SDK v2025.2.0-canary.0 以降でのみ動作します。
 * RPC 機能はこのバージョンで初めて導入されました。
 */
test.describe('RPC test', () => {
  test('2 つのページ間で RPC の push 通知が送信される', async ({ browser }) => {
    // 2 つの独立したブラウザコンテキストを作成
    // 各コンテキストは独立した Cookie、localStorage 等を持つため、
    // 完全に独立した 2 人のユーザーをシミュレートできる
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()
    const page1 = await context1.newPage()
    const page2 = await context2.newPage()

    try {
      // 両方のページで RPC テストページにアクセス
      await page1.goto('http://localhost:9000/rpc/')
      await page2.goto('http://localhost:9000/rpc/')

      // page1 でバージョンチェック
      const versionCheck = await checkSoraVersion(page1, {
        majorVersion: 2025,
        minorVersion: 2,
        featureName: 'RPC',
      })

      if (!versionCheck.isSupported) {
        test.skip(true, versionCheck.skipReason || 'Version not supported')
        return
      }

      const channelName = randomUUID()

      // チャンネル名を設定
      await page1.fill('#channel-name', channelName)
      await page2.fill('#channel-name', channelName)

      // 両方のページで接続を確立
      await page1.click('#connect')
      await page2.click('#connect')

      // 接続が確立されるまで待機（connection-id が表示されるまで）
      await page1.waitForSelector('#connection-id:not(:empty)', { timeout: 5000 })
      await page2.waitForSelector('#connection-id:not(:empty)', { timeout: 5000 })

      // リモートビデオが表示されるまで待機（お互いのビデオが見えていることを確認）
      await page1.waitForSelector('#remote-videos video', { timeout: 5000 })
      await page2.waitForSelector('#remote-videos video', { timeout: 5000 })

      // RPC データチャネルが確立されるまで待機
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

      // page1 で RPC を実行
      await page1.fill('#rpc-input', 'test-value-from-page1')
      await page1.click('#rpc-button')

      // page1 で RPC が正常に送信されたことを確認
      await page1.waitForFunction(
        () => {
          const result = document.querySelector('#rpc-result')
          return result && result.textContent === 'RPC sent successfully'
        },
        { timeout: 5000 },
      )

      // page1 自身で push 通知を受信し、内容を取得
      const pushContent1 = await page1
        .waitForFunction(
          () => {
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

            // データが揃ったら返す（値が空でなければ）
            if (data.value) {
              return data
            }
            return null
          },
          { timeout: 5000 },
        )
        .then((handle) => handle.jsonValue())

      expect(pushContent1).toBeTruthy()
      expect(pushContent1?.action).toBe('PutMetadataItem')
      expect(pushContent1?.key).toBe('abc')
      expect(pushContent1?.value).toBe('test-value-from-page1')
      expect(pushContent1?.type).toBe('signaling_notify_metadata_ext')

      // page2 でも push 通知を受信し、内容を検証
      const pushContent2 = await page2
        .waitForFunction(
          () => {
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

            // データが揃ったら返す（値が空でなければ）
            if (data.value) {
              return data
            }
            return null
          },
          { timeout: 5000 },
        )
        .then((handle) => handle.jsonValue())

      expect(pushContent2).toBeTruthy()
      expect(pushContent2?.action).toBe('PutMetadataItem')
      expect(pushContent2?.key).toBe('abc')
      expect(pushContent2?.value).toBe('test-value-from-page1')
      expect(pushContent2?.type).toBe('signaling_notify_metadata_ext')

      // 両方のページの push-result をクリアして、クリアされたことを確認
      await page1.evaluate(() => {
        const pushResult = document.querySelector('#push-result')
        if (pushResult) pushResult.innerHTML = ''
      })
      await page2.evaluate(() => {
        const pushResult = document.querySelector('#push-result')
        if (pushResult) pushResult.innerHTML = ''
      })

      // 逆方向のテスト: page2 から page1 へ

      // page2 で RPC を実行
      await page2.fill('#rpc-input', 'test-value-from-page2')
      await page2.click('#rpc-button')

      await page2.waitForFunction(
        () => {
          const result = document.querySelector('#rpc-result')
          return result && result.textContent === 'RPC sent successfully'
        },
        { timeout: 5000 },
      )

      // page2 自身でも push 通知を受信し、内容を検証
      const pushContentPage2 = await page2
        .waitForFunction(
          () => {
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

            // データが揃ったら返す（値が空でなければ）
            if (data.value) {
              return data
            }
            return null
          },
          { timeout: 10000 },
        )
        .then((handle) => handle.jsonValue())

      expect(pushContentPage2).toBeTruthy()
      expect(pushContentPage2?.action).toBe('PutMetadataItem')
      expect(pushContentPage2?.key).toBe('abc')
      expect(pushContentPage2?.value).toBe('test-value-from-page2')
      expect(pushContentPage2?.type).toBe('signaling_notify_metadata_ext')

      // page1でも新しいpush通知を受信し、内容を検証
      const pushContentPage1 = await page1
        .waitForFunction(
          () => {
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

            // データが揃ったら返す（値が空でなければ）
            if (data.value) {
              return data
            }
            return null
          },
          { timeout: 10000 },
        )
        .then((handle) => handle.jsonValue())

      expect(pushContentPage1).toBeTruthy()
      expect(pushContentPage1?.action).toBe('PutMetadataItem')
      expect(pushContentPage1?.key).toBe('abc')
      expect(pushContentPage1?.value).toBe('test-value-from-page2')
      expect(pushContentPage1?.type).toBe('signaling_notify_metadata_ext')

      // page1 でも統計情報を再取得
      await page1.click('#get-stats')
      // 統計情報が更新されるまで少し待機
      await page1.waitForTimeout(500)

      const statsAfterRpc1 = await page1.evaluate(() => {
        const statsDiv = document.querySelector('#stats-report') as HTMLElement
        return statsDiv?.dataset.statsReportJson
      })

      const statsAfter1 = JSON.parse(statsAfterRpc1 || '[]') as Array<Record<string, unknown>>
      const rpcDataChannel1 = statsAfter1.find(
        (report) => report.type === 'data-channel' && report.label === 'rpc',
      )

      // page1 では両方向でメッセージが送受信されているはず
      expect(rpcDataChannel1).toBeTruthy()
      expect(Number(rpcDataChannel1?.messagesSent || 0)).toBeGreaterThan(0)
      expect(Number(rpcDataChannel1?.bytesSent || 0)).toBeGreaterThan(0)

      // page2 でも統計情報を再取得
      await page2.click('#get-stats')
      // 統計情報が更新されるまで少し待機
      await page2.waitForTimeout(500)

      const statsAfterRpc2 = await page2.evaluate(() => {
        const statsDiv = document.querySelector('#stats-report') as HTMLElement
        return statsDiv?.dataset.statsReportJson
      })

      const statsAfter2 = JSON.parse(statsAfterRpc2 || '[]') as Array<Record<string, unknown>>
      const rpcDataChannel2 = statsAfter2.find(
        (report) => report.type === 'data-channel' && report.label === 'rpc',
      )

      // page2 でも両方向でメッセージが送受信されているはず
      expect(rpcDataChannel2).toBeTruthy()
      expect(Number(rpcDataChannel2?.messagesSent || 0)).toBeGreaterThan(0)
      expect(Number(rpcDataChannel2?.bytesSent || 0)).toBeGreaterThan(0)
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
