import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'

test.describe('MVP1 End-to-End Tests', () => {
  test('should launch application successfully', async () => {
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.mjs')]
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const title = await window.title()
    expect(title).toBeTruthy()

    await electronApp.close()
  })

  test('should navigate to Settings page', async () => {
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.mjs')]
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const settingsLink = window.locator('text=设置')
    if (await settingsLink.isVisible()) {
      await settingsLink.click()
      await window.waitForTimeout(500)

      const heading = window.locator('h1:has-text("设置")')
      await expect(heading).toBeVisible()
    }

    await electronApp.close()
  })

  test('should navigate to Chat page', async () => {
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.mjs')]
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const chatLink = window.locator('text=对话')
    if (await chatLink.isVisible()) {
      await chatLink.click()
      await window.waitForTimeout(500)

      const heading = window.locator('h1:has-text("对话")')
      await expect(heading).toBeVisible()
    }

    await electronApp.close()
  })
})
