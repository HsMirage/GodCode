import { test, expect } from './fixtures/electron'

test.describe('Application Launch', () => {
  test('launches app and displays main window', async ({ window }) => {
    const title = await window.title()
    expect(title).toBeTruthy()
  })

  test('top navigation renders with branding', async ({ window }) => {
    // Check CodeAll branding is visible in TopNavigation
    const branding = window.locator('text=CodeAll').first()
    await expect(branding).toBeVisible()

    // Check settings button exists
    const settingsBtn = window.locator('button[title="Settings"]')
    await expect(settingsBtn).toBeVisible()
  })

  test('sidebar renders with sessions header', async ({ window }) => {
    // Check sidebar spaces header exists
    const sessionsHeader = window.locator('h2:has-text("Spaces")')
    await expect(sessionsHeader).toBeVisible()
  })

  test('main layout loads correctly', async ({ window }) => {
    // Check the main layout container exists
    const mainLayout = window.locator('h2:has-text("Spaces")').first()
    await expect(mainLayout).toBeVisible()

    // Check CodeAll branding
    const branding = window.locator('text=CodeAll').first()
    await expect(branding).toBeVisible()
  })
})

