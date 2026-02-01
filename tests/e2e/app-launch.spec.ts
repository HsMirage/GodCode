import { test, expect } from './fixtures/electron'

test.describe('Application Launch', () => {
  test('launches app and displays main window', async ({ window }) => {
    const title = await window.title()
    expect(title).toBeTruthy()
  })

  test('sidebar renders with navigation items', async ({ window }) => {
    const sidebar = window.locator('aside')
    await expect(sidebar).toBeVisible()

    const chatNav = window.locator('a:has-text("对话")')
    await expect(chatNav).toBeVisible()

    const settingsNav = window.locator('a:has-text("设置")')
    await expect(settingsNav).toBeVisible()
  })

  test('workspace branding is displayed', async ({ window }) => {
    const branding = window.locator('text=CodeAll')
    await expect(branding).toBeVisible()

    const workspaceLabel = window.locator('text=Workspace')
    await expect(workspaceLabel).toBeVisible()
  })

  test('main content area loads', async ({ window }) => {
    const chatHeading = window.locator('h1:has-text("对话")')
    const settingsHeading = window.locator('h1:has-text("设置")')

    const eitherVisible = (await chatHeading.isVisible()) || (await settingsHeading.isVisible())
    expect(eitherVisible).toBe(true)
  })
})
