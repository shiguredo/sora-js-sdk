import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { checkSoraVersion } from './helper'

/**
 * RPC 機能の E2E テスト
 *
 * Simulcast sendonly/recvonly で 2025.2.0/RequestSimulcastRid を使って
 * RID を切り替えるテスト
 */
test.describe('RPC RequestSimulcastRid test', () => {
  test('RPC で simulcast rid を切り替えられる', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('http://localhost:9000/rpc/')

    // バージョンチェック
    const versionCheck = await checkSoraVersion(page, {
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
    await page.fill('#channel-name', channelName)

    // 接続 (sendonly と recvonly 両方)
    await page.click('#connect')

    // sendonly の connection-id が表示されるまで待機
    await page.waitForSelector('#sendonly-connection-id:not(:empty)', { timeout: 30000 })

    // recvonly の connection-id が表示されるまで待機
    await page.waitForSelector('#recvonly-connection-id:not(:empty)', { timeout: 30000 })

    // rpcMethods が表示されるまで待機
    await page.waitForSelector('#rpc-methods:not(:empty)', { timeout: 15000 })

    // rpcMethods に 2025.2.0/RequestSimulcastRid が含まれていることを確認
    const rpcMethods = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('#rpc-methods')
      return element?.dataset.rpcMethods ? JSON.parse(element.dataset.rpcMethods) : []
    })
    expect(rpcMethods).toContain('2025.2.0/RequestSimulcastRid')

    // リモートビデオが表示されるまで待機
    await page.waitForSelector('#remote-videos video', { timeout: 15000 })

    // RPC データチャネルが開くまで待機
    await page.click('#get-stats')
    await page.waitForFunction(
      () => {
        const statsDiv = document.querySelector('#stats-report') as HTMLElement
        const statsJson = statsDiv?.dataset.statsReportJson
        if (statsJson) {
          const stats = JSON.parse(statsJson)
          return stats.some(
            (report: { type: string; label?: string; state?: string }) =>
              report.type === 'data-channel' && report.label === 'rpc' && report.state === 'open',
          )
        }
        return false
      },
      { timeout: 15000 },
    )

    // 安定するまで待機
    await page.waitForTimeout(3000)

    // 初期解像度を取得 (r2 で開始)
    const initialResolution = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('#video-resolution')
      return {
        width: Number(element?.dataset.width || 0),
        height: Number(element?.dataset.height || 0),
      }
    })
    console.log(`Initial resolution (r2): ${initialResolution.width}x${initialResolution.height}`)

    // r0 に切り替え (RPC 実行)
    await page.click('input[name="rid"][value="r0"]')

    // RPC ログにリクエストが記録されるまで待機
    await page.waitForFunction(
      () => {
        const element = document.querySelector<HTMLElement>('#rpc-log')
        return element?.textContent?.includes('Request: rid=r0')
      },
      { timeout: 15000 },
    )

    // simulcast.switched で current_rid が r0 に変わるまで待機
    await page.waitForFunction(
      () => {
        const element = document.querySelector<HTMLElement>('#current-rid')
        return element?.dataset.currentRid === 'r0'
      },
      { timeout: 15000 },
    )

    // 解像度が変わるまで待機
    await page.waitForTimeout(3000)

    // r0 の解像度を取得
    const r0Resolution = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('#video-resolution')
      return {
        width: Number(element?.dataset.width || 0),
        height: Number(element?.dataset.height || 0),
      }
    })
    console.log(`r0 resolution: ${r0Resolution.width}x${r0Resolution.height}`)

    // r0 は最も低い解像度なので、初期解像度より小さいはず
    expect(r0Resolution.width).toBeLessThan(initialResolution.width)
    expect(r0Resolution.height).toBeLessThan(initialResolution.height)

    // r2 に戻す
    await page.click('input[name="rid"][value="r2"]')

    // simulcast.switched で current_rid が r2 に変わるまで待機
    await page.waitForFunction(
      () => {
        const element = document.querySelector<HTMLElement>('#current-rid')
        return element?.dataset.currentRid === 'r2'
      },
      { timeout: 15000 },
    )

    // 解像度が戻るまで待機
    await page.waitForTimeout(3000)

    // r2 の解像度を取得
    const r2Resolution = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('#video-resolution')
      return {
        width: Number(element?.dataset.width || 0),
        height: Number(element?.dataset.height || 0),
      }
    })
    console.log(`r2 resolution: ${r2Resolution.width}x${r2Resolution.height}`)

    // r2 は最も高い解像度なので、r0 より大きいはず
    expect(r2Resolution.width).toBeGreaterThan(r0Resolution.width)
    expect(r2Resolution.height).toBeGreaterThan(r0Resolution.height)

    // RPC ログに Request と Response が記録されていることを確認
    const rpcLogContent = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('#rpc-log')
      return element?.textContent || ''
    })
    expect(rpcLogContent).toContain('Request: rid=r0')
    expect(rpcLogContent).toContain('Request: rid=r2')

    // 切断
    await page.click('#disconnect')

    // クリーンアップ
    await page.close()
    await context.close()
  })
})
