import { test } from '@playwright/test'

test('click buttons', async ({ page }) => {
  await page.goto('http://localhost:9000/recvonly/')

  await page.click('#start-recvonly')

  await page.waitForTimeout(3000)

  await page.click('#stop-recvonly')
})
