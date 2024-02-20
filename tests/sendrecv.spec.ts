import { test } from '@playwright/test'

test('click buttons', async ({ page }) => {
  await page.goto('http://localhost:9000/sendrecv/')

  await page.click('#start-sendrecv1')
  await page.click('#start-sendrecv2')

  await page.waitForTimeout(3000)

  await page.click('#stop-sendrecv1')
  await page.click('#stop-sendrecv2')
})
