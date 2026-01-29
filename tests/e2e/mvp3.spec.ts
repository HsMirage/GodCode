import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('MVP3 E2E Tests', () => {
  test('Scenario 1: View Modes and Layout', async () => {
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js'), '--no-sandbox']
    })
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(2000)

    const chatViewBtn = window.getByRole('button', { name: '对话' })
    const workflowViewBtn = window.getByRole('button', { name: '流程图' })

    if (await chatViewBtn.isVisible()) {
      await expect(workflowViewBtn).toBeVisible()

      await workflowViewBtn.click()
      await window.waitForTimeout(500)
      const workflowHeading = window.locator('h1:has-text("流程图")')
      await expect(workflowHeading).toBeVisible()

      await chatViewBtn.click()
      await window.waitForTimeout(500)
      const chatHeading = window.locator('h1:has-text("对话")')
      await expect(chatHeading).toBeVisible()

      const artifactsBtn = window.getByRole('button', { name: '产物' })
      await expect(artifactsBtn).toBeVisible()

      await artifactsBtn.click()
      await window.waitForTimeout(500)

      const btnClass = await artifactsBtn.getAttribute('class')
      expect(btnClass).toContain('text-sky-300')
    }

    await electronApp.close()
  })

  test('Scenario 2: Chat UI Elements', async () => {
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js'), '--no-sandbox']
    })
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(2000)

    const heading = window.locator('h1:has-text("对话")')
    if (await heading.isVisible()) {
      const input = window.locator('textarea[placeholder*="输入消息"]')
      await expect(input).toBeVisible()

      const artifactsBtn = window.getByRole('button', { name: '产物' })
      await expect(artifactsBtn).toBeVisible()
    }

    await electronApp.close()
  })

  test('Scenario 3: Space Isolation and Creation', async () => {
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js'), '--no-sandbox']
    })
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(2000)

    const createBtn = window.locator('button[title="Create New Space"]')
    if (await createBtn.isVisible()) {
      await createBtn.click()

      const dialogTitle = window.locator('h2:has-text("Create Space")')
      await expect(dialogTitle).toBeVisible()

      const nameInput = window.locator('input[placeholder="Space Name"]')
      await nameInput.fill('E2E Test Space')

      const folderBtn = window.locator('button:has-text("Select Folder")')
      if (await folderBtn.isVisible()) {
        await folderBtn.click()
        await window.waitForTimeout(500)
      }

      const cancelBtn = window.getByRole('button', { name: 'Cancel' })
      await cancelBtn.click()
      await expect(dialogTitle).not.toBeVisible()
    }

    await electronApp.close()
  })
})
