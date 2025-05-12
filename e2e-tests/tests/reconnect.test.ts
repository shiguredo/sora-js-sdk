import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

// Sora API を利用するので要注意
test('sendonly_reconnect type:reconnect pages', async ({ page }) => {
  test.skip(
    process.env.RUNNER_ENVIRONMENT === 'self-hosted',
    'Sora API を利用するので Tailscale が利用できない self-hosted では実行しない',
  )

  // デバッグ用
  page.on('console', (msg) => {
    console.log(msg.type(), msg.text())
  })

  // それぞれのページに対して操作を行う
  await page.goto('http://localhost:9000/sendonly_reconnect/')

  // SDK バージョンの表示
  await page.waitForSelector('#sora-js-sdk-version')
  const sdkVersion = await page.$eval('#sora-js-sdk-version', (el) => el.textContent)
  console.log(`sdkVersion=${sdkVersion}`)

  const channelName = randomUUID()
  await page.fill('#channel-name', channelName)

  await page.click('#connect')

  // #connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await page.waitForSelector('#connection-id:not(:empty)')
  const connectionId = await page.$eval('#connection-id', (el) => el.textContent)
  console.log(`connectionId=${connectionId}`)

  // レース対策
  await page.waitForTimeout(5000)

  // API で切断
  await page.click('#disconnect-api')

  // レース対策
  await page.waitForTimeout(5000)

  // #connection-id 要素の内容を取得
  await page.waitForSelector('#connection-id:not(:empty)')
  const reconnectConnectionId = await page.$eval('#connection-id', (el) => el.textContent)
  console.log(`reconnectConnectionId=${reconnectConnectionId}`)

  expect(reconnectConnectionId).not.toBe(connectionId)

  await page.waitForSelector('#reconnect-log')
  const reconnectLog = await page.$eval('#reconnect-log', (el) => el.textContent)
  expect(reconnectLog).toBe('Success')

  await page.close()
})
