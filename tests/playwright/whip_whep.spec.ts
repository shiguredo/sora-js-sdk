import { expect, test } from '@playwright/test'

test.skip('sendrecv x2', async ({ browser }) => {
  const whip = await browser.newPage()
  const whep = await browser.newPage()

  await whip.goto('http://localhost:9000/whip/')
  await whep.goto('http://localhost:9000/whep/')

  // コーデックの取得
  const whipVideoCodecType = await whip.evaluate(() => {
    const videoElement = document.querySelector('#video-codec-type') as HTMLSelectElement
    return videoElement.value
  })
  console.log(`whipVideoCodecType=${whipVideoCodecType}`)

  const whepVideoCodecType = await whep.evaluate(() => {
    const videoElement = document.querySelector('#video-codec-type') as HTMLSelectElement
    return videoElement.value
  })
  console.log(`whepVideoCodecType=${whepVideoCodecType}`)

  await whip.click('#connect')
  await whep.click('#connect')

  // connection-stateが"connected"になるまで待つ
  await whip.waitForSelector('#connection-state:has-text("connected")')
  await whep.waitForSelector('#connection-state:has-text("connected")')

  // connection-stateの値を取得して確認
  const whipConnectionState = await whip.$eval('#connection-state', (el) => el.textContent)
  console.log(`whip connectionState=${whipConnectionState}`)

  const whepConnectionState = await whep.$eval('#connection-state', (el) => el.textContent)
  console.log(`whep connectionState=${whepConnectionState}`)

  await whip.click('#disconnect')
  await whep.click('#disconnect')

  await whip.close()
  await whep.close()
})
