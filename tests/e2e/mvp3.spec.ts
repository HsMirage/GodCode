import { test, expect } from './fixtures/electron'

test.describe('MVP3 E2E Tests', () => {
  test('Scenario 1: Main Layout Elements', async ({ window }) => {
    // Check main layout is visible
    const mainLayout = window.locator('h2:has-text("Spaces")').first()
    await expect(mainLayout).toBeVisible()

    // Check CodeAll branding
    const branding = window.locator('text=CodeAll').first()
    await expect(branding).toBeVisible()
  })

  test('Scenario 2: Chat UI Elements', async ({ window }) => {
    // Check message input exists
    const textarea = window.locator('textarea')
    await expect(textarea).toBeVisible()

    // Check sidebar spaces header
    const sessionsHeader = window.locator('h2:has-text("Spaces")')
    await expect(sessionsHeader).toBeVisible()
  })

  test('Scenario 3: Space Creation UI', async ({ window }) => {
    const createBtn = window.locator('button[title="New Space"]')
    await expect(createBtn).toBeVisible()

    // Click create space (opens selector in normal mode; uses temp dir in e2e)
    await createBtn.click()

    // Ensure sidebar remains interactive after creation
    const spacesHeader = window.locator('h2:has-text("Spaces")')
    await expect(spacesHeader).toBeVisible()
  })

  test('Scenario 4: Settings Access', async ({ window }) => {
    const settingsBtn = window.locator('button[title="Settings"]')
    await expect(settingsBtn).toBeVisible()

    // Click settings
    await settingsBtn.click()
    await expect(window.locator('text=API服务商').first()).toBeVisible()
  })
})

