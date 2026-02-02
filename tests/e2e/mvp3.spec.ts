import { test, expect } from './fixtures/electron'

test.describe('MVP3 E2E Tests', () => {
  test('Scenario 1: Main Layout Elements', async ({ window }) => {
    // Check main layout is visible
    const mainLayout = window.locator('.h-screen').first()
    await expect(mainLayout).toBeVisible()

    // Check CodeAll branding
    const branding = window.locator('text=CodeAll').first()
    await expect(branding).toBeVisible()
  })

  test('Scenario 2: Chat UI Elements', async ({ window }) => {
    // Check message input exists
    const textarea = window.locator('textarea')
    await expect(textarea).toBeVisible()

    // Check sidebar sessions header - use specific selector
    const sessionsHeader = window.locator('h2:has-text("Sessions")')
    await expect(sessionsHeader).toBeVisible()
  })

  test('Scenario 3: Space Creation UI', async ({ window }) => {
    const createBtn = window.locator('button[title="Create New Space"]')
    await expect(createBtn).toBeVisible()

    // Click to show input
    await createBtn.click()
    await window.waitForTimeout(500)

    // Check input appears
    const input = window.locator('input[placeholder="Space name..."]')
    await expect(input).toBeVisible()
  })

  test('Scenario 4: Settings Access', async ({ window }) => {
    const settingsBtn = window.locator('button[title="Settings"]')
    await expect(settingsBtn).toBeVisible()

    // Click settings
    await settingsBtn.click()
    await window.waitForTimeout(500)
  })
})
