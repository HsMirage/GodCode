/**
 * Electron App Fixture for CodeAll E2E Tests
 *
 * Usage:
 *   import { test, expect } from './fixtures/electron'
 *   test('my test', async ({ electronApp, window }) => { ... })
 *
 * Note: Electron tests cannot run in WSL2 due to networking limitations.
 * Run from Windows PowerShell: pnpm test:e2e
 */

import { test as base, ElectronApplication, Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.join(__dirname, '../../../')

/**
 * Detect if running in WSL environment where Electron tests cannot work
 * due to Windows/WSL2 localhost networking isolation
 */
function isWSL(): boolean {
  try {
    const release = os.release().toLowerCase()
    if (release.includes('microsoft') || release.includes('wsl')) {
      return true
    }
    if (fs.existsSync('/proc/version')) {
      const version = fs.readFileSync('/proc/version', 'utf8').toLowerCase()
      return version.includes('microsoft') || version.includes('wsl')
    }
  } catch {
    return false
  }
  return false
}

interface ElectronFixtures {
  electronApp: ElectronApplication
  window: Page
}

const IS_WSL = isWSL()

export const test = base.extend<ElectronFixtures>({
  electronApp: async (
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture requires this pattern
    {},
    use,
    testInfo
  ) => {
    if (IS_WSL) {
      testInfo.skip(
        true,
        'Electron E2E tests cannot run in WSL2 (WebSocket localhost isolation). Run from Windows: pnpm test:e2e'
      )
      return
    }

    console.log(`[E2E] Launching app from: ${PROJECT_ROOT}`)

    const app = await electron.launch({
      args: [PROJECT_ROOT, '--no-sandbox'],
      env: {
        ...process.env,
        ELECTRON_DISABLE_GPU: '1',
        CODEALL_E2E_TEST: '1',
        NODE_ENV: 'test'
      }
    })

    await use(app)
    await app.close()
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(2000)
    await use(window)
  }
})

export { expect } from '@playwright/test'

export async function takeScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/${name}-${Date.now()}.png`,
    fullPage: true
  })
}

export async function waitForAppReady(window: Page): Promise<void> {
  await window.waitForSelector('aside', { timeout: 30000 })
}

export async function navigateTo(window: Page, destination: 'chat' | 'settings'): Promise<void> {
  const label = destination === 'chat' ? '对话' : '设置'
  const link = window.locator(`a:has-text("${label}")`)
  await link.click()
  await window.waitForTimeout(500)
}
