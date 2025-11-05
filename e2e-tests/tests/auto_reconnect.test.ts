import { randomUUID } from 'node:crypto'
import { test } from '@playwright/test'

// Sora の異常切断 API を使用した sendrecv 自動再接続テスト
test('sendrecv_auto_reconnect with abnormal disconnection API', async ({ browser }) => {
  test.skip(
    process.env.RUNNER_ENVIRONMENT === 'self-hosted',
    'Sora API を利用するので Tailscale が利用できない self-hosted では実行しない',
  )

  // 2つのページを作成
  const context1 = await browser.newContext()
  const page1 = await context1.newPage()
  const context2 = await browser.newContext()
  const page2 = await context2.newPage()

  // デバッグ用
  page1.on('console', (msg) => {
    console.log('[Page1]', msg.type(), msg.text())
  })
  page2.on('console', (msg) => {
    console.log('[Page2]', msg.type(), msg.text())
  })

  // 両方のページを自動再接続テストページへ遷移
  await page1.goto('http://localhost:9000/sendrecv_auto_reconnect/')
  await page2.goto('http://localhost:9000/sendrecv_auto_reconnect/')

  // SDK バージョンの表示
  await page1.waitForSelector('#sora-js-sdk-version')
  const sdkVersion = await page1.$eval('#sora-js-sdk-version', (el) => el.textContent)
  console.log(`sdkVersion=${sdkVersion}`)

  // 同じチャンネル名を使用
  const channelName = randomUUID()
  await page1.fill('#channel-name', channelName)
  await page2.fill('#channel-name', channelName)

  // 両方のページで接続
  await page1.click('#connect')
  await page2.click('#connect')

  // 両方のページで初回接続時の connection-id を取得
  await page1.waitForSelector('#connection-id:not(:empty)')
  const connectionId1 = await page1.$eval('#connection-id', (el: HTMLElement) => el.textContent)
  console.log(`[Page1] connectionId=${connectionId1}`)

  await page2.waitForSelector('#connection-id:not(:empty)')
  const connectionId2 = await page2.$eval('#connection-id', (el: HTMLElement) => el.textContent)
  console.log(`[Page2] connectionId=${connectionId2}`)

  // お互いのビデオが表示されるのを待つ
  await page1.waitForSelector('#remote-videos video', { timeout: 10000 })
  await page2.waitForSelector('#remote-videos video', { timeout: 10000 })
  console.log('Both pages connected and video streams established')

  // connection-id が設定されていることを確認 (clientId も設定されている保証)
  await page1.waitForSelector('#connection-id:not(:empty)', { timeout: 10000 })
  await page2.waitForSelector('#connection-id:not(:empty)', { timeout: 10000 })

  await page1.waitForTimeout(5000)
  await page2.waitForTimeout(5000)

  // ここで page1 から異常切断 API を呼び出して接続を切断させる
  console.log('[Test] Triggering abnormal disconnection from Page1')

  // ボタンがクリック可能になるまで待つ
  await page1.waitForSelector('#abnormal-disconnect-api:not([disabled])', { timeout: 5000 })

  // force オプションでクリックを強制する
  await page1.click('#abnormal-disconnect-api', { force: true })

  // ここで page1 に再接続のログが出るのを待つ
  // reconnected: true を待つ
  await page1.waitForFunction(
    () => {
      const statusElement = document.querySelector('#reconnect-status') as HTMLElement
      return statusElement && statusElement.dataset.reconnected === 'true'
    },
    {},
    { timeout: 10000 },
  )

  // クリーンアップ
  await page1.close()
  await page2.close()
  await context1.close()
  await context2.close()
})
