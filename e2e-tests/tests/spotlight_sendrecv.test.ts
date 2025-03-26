import { randomUUID } from 'node:crypto'
import { test } from '@playwright/test'

test('spotlight sendrecv x2', async ({ browser }) => {
  const sendrecv1 = await browser.newPage()
  const sendrecv2 = await browser.newPage()

  await sendrecv1.goto('http://localhost:9000/spotlight_sendrecv/')
  await sendrecv2.goto('http://localhost:9000/spotlight_sendrecv/')

  const channelName = randomUUID()

  await sendrecv1.fill('#channel-name', channelName)
  await sendrecv2.fill('#channel-name', channelName)

  await sendrecv1.click('#connect')
  await sendrecv2.click('#connect')

  // #connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendrecv1.waitForSelector('#connection-id:not(:empty)')
  await sendrecv2.waitForSelector('#connection-id:not(:empty)')

  // #sendrecv1-connection-id 要素の内容を取得
  const sendrecv1ConnectionId = await sendrecv1.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendrecv1 connectionId=${sendrecv1ConnectionId}`)

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendrecv2.waitForSelector('#connection-id:not(:empty)')

  // #sendrecv1-connection-id 要素の内容を取得
  const sendrecv2ConnectionId = await sendrecv2.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendrecv2 connectionId=${sendrecv2ConnectionId}`)

  await sendrecv1.click('#disconnect')
  await sendrecv2.click('#disconnect')
})
