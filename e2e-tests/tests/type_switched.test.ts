import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('switched コールバックが呼び出されることを確認する', async ({ browser }) => {
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

  // switched コールバックが呼ばれて #switched-status が 'switched' になるまで待つ
  await page.waitForSelector('#switched-status:not(:empty)')
  const switchedStatus = await page.$eval('#switched-status', (el) => el.textContent)
  expect(switchedStatus).toBe('switched')

  await page.click('#disconnect')

  await page.close()
})
