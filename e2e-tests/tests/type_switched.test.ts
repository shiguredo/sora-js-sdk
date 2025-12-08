import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('signaling コールバックで type: switched を受信することを確認する', async ({ browser }) => {
  const page = await browser.newPage()

  await page.goto('http://localhost:9000/data_channel_signaling_only/')

  // SDK バージョンの表示
  await page.waitForSelector('#sora-js-sdk-version')
  const sdkVersion = await page.$eval('#sora-js-sdk-version', (el) => el.textContent)
  console.log(`sdkVersion=${sdkVersion}`)

  const channelName = randomUUID()
  await page.fill('#channel-name', channelName)

  await page.click('#connect')

  // connection-id が設定されるまで待つ
  await page.waitForSelector('#connection-id:not(:empty)')

  const connectionId = await page.$eval('#connection-id', (el) => el.textContent)
  console.log(`connectionId=${connectionId}`)

  // signaling コールバックで onmessage-switched を受信して #signaling-type-switched が設定されるまで待つ
  await page.waitForSelector('#signaling-type-switched:not(:empty)')
  const signalingTypeSwitched = await page.$eval('#signaling-type-switched', (el) => el.textContent)
  expect(signalingTypeSwitched).toBe('websocket')

  await page.click('#disconnect')

  await page.close()
})
