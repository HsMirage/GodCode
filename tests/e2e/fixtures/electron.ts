/**
 * Electron App Fixture for CodeAll E2E Tests
 *
 * Usage:
 *   import { test, expect } from './fixtures/electron'
 *   test('my test', async ({ electronApp, window }) => { ... })
 */

import { test as base, ElectronApplication, Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const MAIN_ENTRY = path.join(__dirname, '../../../out/main/index.js')

interface ElectronFixtures {
  electronApp: ElectronApplication
  window: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async (
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture requires this pattern
    {},
    use
  ) => {
    console.log(`[E2E] Launching app from: ${MAIN_ENTRY}`)

    const app = await electron.launch({
      args: [MAIN_ENTRY, '--no-sandbox'],
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
