import { expect, test } from '@playwright/test'

test('data_channel_signaling_only type:switched pages', async ({ browser }) => {
  // 新しいページを2つ作成
  const dataChannelSignalingOnly = await browser.newPage()

  // デバッグ用
  // dataChannelSignalingOnly.on('console', (msg) => {
  //   console.log(msg.type(), msg.text())
  // })

  // それぞれのページに対して操作を行う
  await dataChannelSignalingOnly.goto('http://localhost:9000/data_channel_signaling_only/')

  // SDK バージョンの表示
  await dataChannelSignalingOnly.waitForSelector('#sdk-version')
  const dataChannelSignalingOnlySdkVersion = await dataChannelSignalingOnly.$eval(
    '#sdk-version',
    (el) => el.textContent,
  )
  console.log(`dataChannelSignalingOnly sdkVersion=${dataChannelSignalingOnlySdkVersion}`)

  await dataChannelSignalingOnly.click('#connect')
  // console.log に [signaling] switched が出力されるまで待機するための Promise を作成する
  const consolePromise = dataChannelSignalingOnly.waitForEvent('console')

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await dataChannelSignalingOnly.waitForSelector('#connection-id:not(:empty)')

  // #sendonly-connection-id 要素の内容を取得
  const dataChannelSignalingOnlyConnectionId = await dataChannelSignalingOnly.$eval(
    '#connection-id',
    (el) => el.textContent,
  )
  console.log(`dataChannelSignalingOnly connectionId=${dataChannelSignalingOnlyConnectionId}`)

  // レース対策
  await dataChannelSignalingOnly.waitForTimeout(3000)

  // Console log の Promise が解決されるまで待機する
  const msg = await consolePromise
  // log [signaling] onmessage-switched websocket が出力されるので、args 0/1/2 をそれぞれチェックする
  // [signaling]
  const value1 = await msg.args()[0].jsonValue()
  expect(value1).toBe('[signaling]')
  // onmessage-switched
  const value2 = await msg.args()[1].jsonValue()
  expect(value2).toBe('onmessage-switched')
  // websocket
  const value3 = await msg.args()[2].jsonValue()
  expect(value3).toBe('websocket')

  await dataChannelSignalingOnly.click('#disconnect')

  await dataChannelSignalingOnly.close()
})
