import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

// Sora API を利用するので要注意
test('data_channel_signaling_only type:close pages', async ({ page }) => {
  test.skip(
    process.env.RUNNER_ENVIRONMENT === 'self-hosted',
    'Sora API を利用するので Tailscale が利用できない self-hosted では実行しない',
  )

  // デバッグ用
  page.on('console', (msg) => {
    console.log(msg.type(), msg.text())
  })

  // それぞれのページに対して操作を行う
  await page.goto('http://localhost:9000/data_channel_signaling_only/')

  // SDK バージョンの表示
  await page.waitForSelector('#sora-js-sdk-version')
  const dataChannelSignalingOnlySdkVersion = await page.$eval(
    '#sora-js-sdk-version',
    (el) => el.textContent,
  )
  console.log(`dataChannelSignalingOnly sdkVersion=${dataChannelSignalingOnlySdkVersion}`)

  const channelName = randomUUID()
  await page.fill('#channel-name', channelName)

  await page.click('#connect')

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await page.waitForSelector('#connection-id:not(:empty)')

  // #sendonly-connection-id 要素の内容を取得
  const dataChannelSignalingOnlyConnectionId = await page.$eval(
    '#connection-id',
    (el) => el.textContent,
  )
  console.log(`dataChannelSignalingOnly connectionId=${dataChannelSignalingOnlyConnectionId}`)

  // API で切断
  await page.click('#disconnect-api')

  // #signaling-close-type 要素に datachannel が設定されるまで待つ
  await page.waitForSelector('#signaling-close-type:not(:empty)')
  const signalingCloseType = await page.$eval('#signaling-close-type', (el) => el.textContent)
  expect(signalingCloseType).toBe('datachannel')

  await page.close()
})
