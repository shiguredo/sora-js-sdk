import { test } from '@playwright/test'

test('messaging pages', async ({ browser }) => {
  // 新しいページを2つ作成
  const page1 = await browser.newPage()
  const page2 = await browser.newPage()

  // それぞれのページに対して操作を行う
  await page1.goto('http://localhost:9000/messaging/')
  await page2.goto('http://localhost:9000/messaging/')

  await page1.click('#start')
  await page2.click('#start')

  await page1.waitForSelector('#connection-id:not(:empty)')
  const page1ConnectionId = await page1.$eval('#connection-id', (el) => el.textContent)
  console.log(`page1 connectionId=${page1ConnectionId}`)

  await page2.waitForSelector('#connection-id:not(:empty)')
  const page2ConnectionId = await page2.$eval('#connection-id', (el) => el.textContent)
  console.log(`page2 connectionId=${page2ConnectionId}`)

  // page1からpage2へメッセージを送信
  await page1.fill('input[name="message"]', 'Hello from page1')
  await page1.click('#send-message')

  // page2でメッセージが受信されたことを確認
  await page2.waitForSelector('#received-messages li', { state: 'attached' })
  const receivedMessage1 = await page2.$eval('#received-messages li', (el) => el.textContent)

  // // 受信したメッセージが期待したものであるか検証
  // console.log(`Received message on page2: ${receivedMessage1}`)
  // test.expect(receivedMessage1).toBe('Hello from page1')

  // page2からpage1へメッセージを送信
  await page2.fill('input[name="message"]', 'Hello from page2')
  await page2.click('#send-message')

  // page1でメッセージが受信されたことを確認
  await page1.waitForSelector('li', { state: 'attached' })
  const receivedMessage2 = await page1.$eval('#received-messages li', (el) => el.textContent)

  // // 受信したメッセージが期待したものであるか検証
  // console.log(`Received message on page1: ${receivedMessage2}`)
  // test.expect(receivedMessage2).toBe('Hello from page2')

  await page1.click('#stop')
  await page2.click('#stop')

  await page1.close()
  await page2.close()
})
