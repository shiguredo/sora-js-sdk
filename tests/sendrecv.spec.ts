import { test } from '@playwright/test'

test('sendrecv x2', async ({ browser }) => {
  const page1 = await browser.newPage()
  const page2 = await browser.newPage()

  await page1.goto('http://localhost:9000/sendrecv/')
  await page2.goto('http://localhost:9000/sendrecv/')

  await page1.click('#start')
  await page2.click('#start')

  // #connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await page1.waitForSelector('#connection-id:not(:empty)')

  // #connection-id 要素の内容を取得
  const sendrecv1ConnectionId = await page1.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendrecv1 connectionId=${sendrecv1ConnectionId}`)

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await page2.waitForSelector('#connection-id:not(:empty)')

  // #sendrecv1-connection-id 要素の内容を取得
  const sendrecv2ConnectionId = await page2.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendrecv2 connectionId=${sendrecv2ConnectionId}`)

  await page1.click('#stop')
  await page2.click('#stop')
})
