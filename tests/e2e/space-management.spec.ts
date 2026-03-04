import { test, expect } from './fixtures/electron'

test.describe('Space Management', () => {
  test('top navigation shows create space button', async ({ window }) => {
    const createBtn = window.locator('button[title="New Space"]')
    await expect(createBtn).toBeVisible()
  })

  test('clicking create space keeps sidebar visible', async ({ window }) => {
    const createBtn = window.locator('button[title="New Space"]')
    await createBtn.click()

    const spacesHeader = window.locator('h2:has-text("Spaces")')
    await expect(spacesHeader).toBeVisible()
  })

  test('can create an additional space entry', async ({ window }) => {
    const initialCount = await window.locator('button[title="Rename space"]').count()

    const createBtn = window.locator('button[title="New Space"]')
    await createBtn.click()

    await expect.poll(async () => window.locator('button[title="Rename space"]').count()).toBeGreaterThan(initialCount)
  })

  test('CodeAll branding is clickable', async ({ window }) => {
    const brand = window.locator('text=CodeAll').first()
    await expect(brand).toBeVisible()
    // Click should navigate to home
    await brand.click()
    await window.waitForTimeout(300)
  })

  test('settings button exists in top nav', async ({ window }) => {
    const settingsBtn = window.locator('button[title="Settings"]')
    await expect(settingsBtn).toBeVisible()
  })
})

