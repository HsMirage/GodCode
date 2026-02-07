import { test, expect, navigateTo } from './fixtures/electron'

test.describe('Settings Configuration', () => {
  test('navigates to settings page', async ({ window }) => {
    await navigateTo(window, 'settings')

    // Settings page should show provider tab
    await window.waitForTimeout(2000)
    const providerTab = window.locator('text=API服务商').first()
    await expect(providerTab).toBeVisible()
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
