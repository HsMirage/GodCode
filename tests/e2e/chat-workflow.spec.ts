import { test, expect } from './fixtures/electron'

test.describe('Chat Workflow', () => {
  test('message input is visible on main page', async ({ window }) => {
    // Chat page is the default, message input should be visible
    const textarea = window.locator('textarea')
    await expect(textarea).toBeVisible()
  })

  test('can type message in textarea', async ({ window }) => {
    const textarea = window.locator('textarea')
    const message = `E2E chat test ${Date.now()}`
    await textarea.fill(message)
    await expect(textarea).toHaveValue(message)
  })

  test('main layout is properly rendered', async ({ window }) => {
    // Check that the main layout container exists
    const mainLayout = window.locator('.h-screen')
    await expect(mainLayout).toBeVisible()

    // Check CodeAll branding
    const branding = window.locator('text=CodeAll')
    await expect(branding).toBeVisible()
  })
})
