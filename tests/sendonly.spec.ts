import { test } from '@playwright/test'

test('click buttons', async ({ page }) => {
  await page.goto('http://localhost:9000/sendonly/')

  await page.click('#start-sendonly')

  await page.waitForTimeout(3000)

  await page.click('#stop-sendonly')
})
