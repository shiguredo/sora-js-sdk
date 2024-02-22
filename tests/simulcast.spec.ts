import { test } from '@playwright/test'

test.only('simulcast sendonly/recvonly pages', async ({ page }) => {
  await page.goto('http://localhost:9000/simulcast/')

  await page.click('#start')

  // 安全によせて 5 秒待つ
  await page.waitForTimeout(5000)

  await page.waitForSelector('#local-video-connection-id:not(:empty)')
  const localConnectionId = await page.$eval('#local-video-connection-id', (el) => el.textContent)
  console.log(`local connectionId=${localConnectionId}`)

  await page.waitForSelector('#remote-video-connection-id-r0:not(:empty)')
  const remoteR0ConnectionId = await page.$eval(
    '#remote-video-connection-id-r0',
    (el) => el.textContent,
  )
  console.log(`remote | rid=r0, connectionId=${remoteR0ConnectionId}`)

  await page.waitForSelector('#remote-video-connection-id-r1:not(:empty)')
  const remoteR1ConnectionId = await page.$eval(
    '#remote-video-connection-id-r1',
    (el) => el.textContent,
  )
  console.log(`remote | rid=r1, connectionId=${remoteR1ConnectionId}`)

  await page.waitForSelector('#remote-video-connection-id-r2:not(:empty)')
  const remoteR2ConnectionId = await page.$eval(
    '#remote-video-connection-id-r2',
    (el) => el.textContent,
  )
  console.log(`remote | rid=r2, connectionId=${remoteR2ConnectionId}`)

  await page.click('#stop')

  await page.close()
})
