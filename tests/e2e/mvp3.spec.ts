import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('MVP3 E2E Tests', () => {
  test('Scenario 1: View Modes and Layout', async () => {
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')]
    })
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const chatBtn = window.locator('button:has-text("对话")')
    const workflowBtn = window.locator('button:has-text("流程图")')

    await expect(chatBtn).toBeVisible()
    await expect(workflowBtn).toBeVisible()

    await workflowBtn.click()
    await window.waitForTimeout(500)
    await expect(window.locator('h1:has-text("流程图")')).toBeVisible()

    await chatBtn.click()
    await window.waitForTimeout(500)
    await expect(window.locator('h1:has-text("对话")')).toBeVisible()

    const artifactsBtn = window.locator('button:has-text("产物")')
    await expect(artifactsBtn).toBeVisible()

    await artifactsBtn.click()
    await window.waitForTimeout(500)

    // The button active state has 'text-sky-300' and 'bg-sky-500/20'
    // We verify this to confirm the toggle action occurred successfully
    const btnClass = await artifactsBtn.getAttribute('class')
    expect(btnClass).toContain('text-sky-300')

    await electronApp.close()
  })

  test('Scenario 2: Chat UI Elements', async () => {
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')]
    })
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expect(window.locator('h1:has-text("对话")')).toBeVisible()

    const input = window.locator('textarea[placeholder*="输入消息"]')
    await expect(input).toBeVisible()

    await expect(window.locator('button:has-text("产物")')).toBeVisible()

    await electronApp.close()
  })

  test('Scenario 3: Space Isolation and Creation', async () => {
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')]
    })
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Mock IPC calls to bypass file system dialogs and simulate backend creation logic
    await window.evaluate(() => {
      const originalInvoke = (window as any).codeall.invoke
      const mockSpaces: any[] = []

      ;(window as any).codeall.invoke = async (channel: string, args: any) => {
        if (channel === 'dialog:select-folder') {
          return { success: true, data: '/tmp/mock-space-dir' }
        }

        if (channel === 'space:create') {
          const newSpace = {
            id: 'space-' + Date.now(),
            name: args.name,
            workDir: args.workDir
          }
          mockSpaces.push(newSpace)
          return { success: true, data: newSpace }
        }

        if (channel === 'space:list') {
          // Return purely mock spaces to isolate the test from existing data
          return { success: true, data: mockSpaces }
        }

        return originalInvoke(channel, args).catch((e: any) => {
          console.warn(`[Mock] Original invoke failed for ${channel}:`, e)
          throw e
        })
      }
    })

    const createBtn = window.locator('button[title="Create New Space"]')
    await expect(createBtn).toBeVisible()
    await createBtn.click()

    const dialog = window.locator('text=Create Space')
    await expect(dialog).toBeVisible()

    const nameInput = window.locator('input[placeholder="Space Name"]')
    await nameInput.fill('E2E Test Space')

    const folderBtn = window.locator('button:has-text("Select Folder")')
    await folderBtn.click()

    await expect(window.locator('text=/tmp/mock-space-dir')).toBeVisible()

    const submitBtn = window.locator('button:has-text("Create")')
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    await expect(dialog).not.toBeVisible()

    const spaceSelect = window.locator('select')
    await expect(spaceSelect).toBeVisible()
    await expect(spaceSelect.locator('option:has-text("E2E Test Space")')).toBeVisible()

    await electronApp.close()
  })
})
