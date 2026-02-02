import { test, expect } from './fixtures/electron'

test.describe('MVP1 End-to-End Tests', () => {
  test('should launch application successfully', async ({ window }) => {
    const title = await window.title()
    expect(title).toBeTruthy()
  })

  test('should display CodeAll branding', async ({ window }) => {
    const branding = window.locator('text=CodeAll')
    await expect(branding).toBeVisible()
  })

  test('should have settings button', async ({ window }) => {
    const settingsBtn = window.locator('button[title="Settings"]')
    await expect(settingsBtn).toBeVisible()
  })

  test('should have message input on main page', async ({ window }) => {
    const textarea = window.locator('textarea')
    await expect(textarea).toBeVisible()
  })
})
