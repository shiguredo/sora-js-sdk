import { test } from '@playwright/test'

test.only('sendonly/recvonly pages', async ({ browser }) => {
  // 新しいページを2つ作成
  const page1 = await browser.newPage()
  const page2 = await browser.newPage()

  // それぞれのページに対して操作を行う
  await page1.goto('http://localhost:9000/sendonly/')
  await page2.goto('http://localhost:9000/recvonly/')

  await page1.click('#start-sendonly')
  await page2.click('#start-recvonly')

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await page1.waitForSelector('#sendonly-connection-id:not(:empty)')

  // #sendonly-connection-id 要素の内容を取得
  const sendonlyConnectionId = await page1.$eval('#sendonly-connection-id', (el) => el.textContent)
  console.log(`sendonly connectionId=${sendonlyConnectionId}`)

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await page2.waitForSelector('#recvonly-connection-id:not(:empty)')

  // #sendrecv1-connection-id 要素の内容を取得
  const recvonlyConnectionId = await page2.$eval('#recvonly-connection-id', (el) => el.textContent)
  console.log(`recvonly connectionId=${recvonlyConnectionId}`)

  await page1.click('#stop-sendonly')
  await page2.click('#stop-recvonly')

  await page1.close()
  await page2.close()
})
