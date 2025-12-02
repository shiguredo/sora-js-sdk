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

  // [signaling] onmessage-close datachannel を待つ Promise を先に作成する
  const consolePromise = page.waitForEvent('console', {
    predicate: (msg) => {
      return msg.text().includes('[signaling]') && msg.text().includes('onmessage-close')
    },
    timeout: 10000,
  })

  // API で切断
  await page.click('#disconnect-api')

  // Console log の Promise が解決されるまで待機する
  const msg = await consolePromise
  // log [signaling] onmessage-close datachannel が出力されるので、args 0/1/2 をそれぞれチェックする
  const value1 = await msg.args()[0].jsonValue()
  expect(value1).toBe('[signaling]')
  const value2 = await msg.args()[1].jsonValue()
  expect(value2).toBe('onmessage-close')
  const value3 = await msg.args()[2].jsonValue()
  expect(value3).toBe('datachannel')

  await page.close()
})
