import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { checkSoraVersion } from './helper'

test('connected コールバックが呼び出されることを確認する', async ({ browser }) => {
  const page = await browser.newPage()

  await page.goto('http://localhost:9000/data_channel_signaling_only/')

  // バージョンチェック (connected コールバックは 2025.2.0 で追加)
  const versionCheck = await checkSoraVersion(page, {
    majorVersion: 2025,
    minorVersion: 2,
    featureName: 'connected callback',
  })

  if (!versionCheck.isSupported) {
    test.skip(true, versionCheck.skipReason || 'Version not supported')
    await page.close()
    return
  }

  console.log(`sdkVersion=${versionCheck.version}`)

  const channelName = randomUUID()
  await page.fill('#channel-name', channelName)

  await page.click('#connect')

  // connection-id が設定されるまで待つ
  await page.waitForSelector('#connection-id:not(:empty)')

  const connectionId = await page.$eval('#connection-id', (el) => el.textContent)
  console.log(`connectionId=${connectionId}`)

  // connected コールバックが呼ばれて #connected-status が 'connected' になるまで待つ
  await page.waitForSelector('#connected-status:not(:empty)')
  const connectedStatus = await page.$eval('#connected-status', (el) => el.textContent)
  expect(connectedStatus).toBe('connected')

  await page.click('#disconnect')

  await page.close()
})
