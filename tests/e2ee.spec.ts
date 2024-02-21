import { test } from '@playwright/test'

test.skip('e2ee sendrecv x2', async ({ browser }) => {
  // 新しいページを2つ作成
  const page1 = await browser.newPage()
  const page2 = await browser.newPage()

  // それぞれのページに対して操作を行う
  await page1.goto('http://localhost:9000/e2ee/')
  await page2.goto('http://localhost:9000/e2ee/')

  await page1.click('#start-sendrecv')
  await page2.click('#start-sendrecv')

  // #local-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await page1.waitForSelector('#local-connection-id:not(:empty)')

  // #local-connection-id 要素の内容を取得
  const page1ConnectionId = await page1.$eval('#local-connection-id', (el) => el.textContent)
  console.log(`e2ee-page1: connectionId=${page1ConnectionId}`)

  // #local-fingerprint 要素が存在し、その内容が空でないことを確認するまで待つ
  await page1.waitForSelector('#local-fingerprint:not(:empty)')
  const page1Fingerprint = await page1.$eval('#local-fingerprint', (el) => el.textContent)
  console.log(`e2ee-page1: fingerprint=${page1Fingerprint}`)

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await page2.waitForSelector('#local-connection-id:not(:empty)')

  // #sendrecv1-connection-id 要素の内容を取得
  const page2ConnectionId = await page2.$eval('#local-connection-id', (el) => el.textContent)
  console.log(`e2ee-page2: connectionId=${page2ConnectionId}`)

  // #local-fingerprint 要素が存在し、その内容が空でないことを確認するまで待つ
  await page2.waitForSelector('#local-fingerprint:not(:empty)')
  const page2Fingerprint = await page2.$eval('#local-fingerprint', (el) => el.textContent)
  console.log(`e2ee-page2: fingerprint=${page2Fingerprint}`)

  await page1.click('#stop-sendrecv')
  await page2.click('#stop-sendrecv')
})
