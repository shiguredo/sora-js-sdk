import { test } from '@playwright/test'

test('spotlight sendonly/recvonly pages', async ({ browser }) => {
  // 新しいページを2つ作成
  const sendonly = await browser.newPage()
  const recvonly = await browser.newPage()

  // それぞれのページに対して操作を行う
  await sendonly.goto('http://localhost:9000/spotlight_sendonly/')
  await recvonly.goto('http://localhost:9000/spotlight_recvonly/')

  await sendonly.click('#start')
  await recvonly.click('#start')

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendonly.waitForSelector('#connection-id:not(:empty)')

  // #sendonly-connection-id 要素の内容を取得
  const sendonlyConnectionId = await sendonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`sendonly connectionId=${sendonlyConnectionId}`)

  // #sendrecv1-connection-id 要素が存在し、その内容が空でないことを確認するまで待つ
  await recvonly.waitForSelector('#connection-id:not(:empty)')

  // #sendrecv1-connection-id 要素の内容を取得
  const recvonlyConnectionId = await recvonly.$eval('#connection-id', (el) => el.textContent)
  console.log(`recvonly connectionId=${recvonlyConnectionId}`)

  await sendonly.click('#stop')
  await recvonly.click('#stop')

  await sendonly.close()
  await recvonly.close()
})
