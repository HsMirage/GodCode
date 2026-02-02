import { test, expect, navigateTo } from './fixtures/electron'

test.describe('Settings Configuration', () => {
  test('navigates to settings page', async ({ window }) => {
    await navigateTo(window, 'settings')

    // Settings page should show LLM config tab
    await window.waitForTimeout(2000)
    const llmConfigTab = window.locator('text=LLM配置').first()
    await expect(llmConfigTab).toBeVisible()
  })

  test('can click settings button', async ({ window }) => {
    const settingsBtn = window.locator('button[title="Settings"]')
    await expect(settingsBtn).toBeVisible()
    await settingsBtn.click()
    await window.waitForTimeout(500)
  })

  test('CodeAll branding visible in top nav', async ({ window }) => {
    const branding = window.locator('text=CodeAll')
    await expect(branding).toBeVisible()
  })
})
