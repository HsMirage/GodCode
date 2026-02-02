import { test, expect } from './fixtures/electron'

test.describe('Space Management', () => {
  test('top navigation shows create space button', async ({ window }) => {
    const createBtn = window.locator('button[title="Create New Space"]')
    await expect(createBtn).toBeVisible()
  })

  test('clicking create space shows input form', async ({ window }) => {
    const createBtn = window.locator('button[title="Create New Space"]')
    await createBtn.click()
    await window.waitForTimeout(500)

    // The TopNavigation shows an inline input form when creating
    const input = window.locator('input[placeholder="Space name..."]')
    await expect(input).toBeVisible()
  })

  test('can type space name', async ({ window }) => {
    const createBtn = window.locator('button[title="Create New Space"]')
    await createBtn.click()
    await window.waitForTimeout(500)

    const input = window.locator('input[placeholder="Space name..."]')
    await input.fill('Test Space')
    await expect(input).toHaveValue('Test Space')
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
