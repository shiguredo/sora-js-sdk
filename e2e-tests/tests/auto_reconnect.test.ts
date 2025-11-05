import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

// Sora の異常切断 API を使用した自動再接続テスト
test('sendonly_auto_reconnect with abnormal disconnection API', async ({ page }) => {
  test.skip(
    process.env.RUNNER_ENVIRONMENT === 'self-hosted',
    'Sora API を利用するので Tailscale が利用できない self-hosted では実行しない',
  )

  // デバッグ用
  page.on('console', (msg) => {
    console.log(msg.type(), msg.text())
  })

  // 自動再接続テストページへ遷移
  await page.goto('http://localhost:9000/sendonly_auto_reconnect/')

  // SDK バージョンの表示
  await page.waitForSelector('#sora-js-sdk-version')
  const sdkVersion = await page.$eval('#sora-js-sdk-version', (el) => el.textContent)
  console.log(`sdkVersion=${sdkVersion}`)

  const channelName = randomUUID()
  await page.fill('#channel-name', channelName)

  await page.click('#connect')

  // 初回接続時の connection-id を取得
  await page.waitForSelector('#connection-id:not(:empty)')
  const connectionId = await page.$eval('#connection-id', (el) => el.textContent)
  console.log(`connectionId=${connectionId}`)

  // レース対策
  await page.waitForTimeout(3000)

  // Sora の異常切断 API を呼び出す
  await page.evaluate(() => {
    if (window.testClient) {
      return window.testClient.apiAbnormalDisconnect()
    }
    throw new Error('Client not available')
  })

  // 再接続中の状態を確認
  await page.waitForSelector('#reconnect-status:has-text("Reconnecting...")', { timeout: 10000 })
  console.log('Auto reconnecting...')

  // 再接続成功を待つ
  await page.waitForSelector('#reconnect-status:has-text("Reconnected")', { timeout: 15000 })
  console.log('Auto reconnected successfully')

  // 新しい connection-id を取得
  await page.waitForSelector('#connection-id:not(:empty)')
  const reconnectConnectionId = await page.$eval('#connection-id', (el) => el.textContent)
  console.log(`reconnectConnectionId=${reconnectConnectionId}`)

  // connection-id が変わっていることを確認
  expect(reconnectConnectionId).not.toBe(connectionId)

  // 再接続ログの確認
  await page.waitForSelector('#reconnect-log')
  const reconnectLog = await page.$eval('#reconnect-log', (el) => el.textContent)
  expect(reconnectLog).toBe('Success')

  // 試行回数の確認（1回目で成功するはず）
  const attemptText = await page.$eval('#reconnect-attempt', (el) => el.textContent)
  expect(attemptText).toBe('Attempt: 1')

  await page.close()
})
