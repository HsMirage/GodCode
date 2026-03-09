/**
 * Electron App Fixture for GodCode E2E Tests
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
import type { ChildProcess } from 'child_process'
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

async function closeElectronAppGracefully(app: ElectronApplication): Promise<void> {
  const closeTimeoutMs = 10000
  const processRef = app.process() as ChildProcess | undefined
  let timeoutHandle: NodeJS.Timeout | null = null

  try {
    await Promise.race([
      app.close(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`[E2E] app.close() timed out after ${closeTimeoutMs}ms`))
        }, closeTimeoutMs)
      })
    ])
  } catch (error) {
    console.warn('[E2E] Graceful close timed out, forcing process termination', error)

    if (processRef && !processRef.killed) {
      try {
        processRef.kill('SIGKILL')
      } catch (killError) {
        console.warn('[E2E] Failed to force-kill Electron process', killError)
      }
    }

    await new Promise<void>(resolve => {
      setTimeout(resolve, 300)
    })
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

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

    const e2eSpaceDir = path.join(
      os.tmpdir(),
      `godcode-e2e-space-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    )

    const launchEnv = Object.fromEntries(
      Object.entries({
        ...process.env,
        ELECTRON_DISABLE_GPU: '1',
        GODCODE_E2E_TEST: '1',
        GODCODE_E2E_SPACE_DIR: e2eSpaceDir,
        NODE_ENV: 'test'
      }).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
    delete launchEnv.ELECTRON_RUN_AS_NODE

    const app = await electron.launch({
      args: [path.join(PROJECT_ROOT, 'out/main/index.js'), '--no-sandbox'],
      env: launchEnv
    })

    await use(app)
    await closeElectronAppGracefully(app)
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()

    // Capture console messages for debugging
    window.on('console', msg => {
      console.log(`[Renderer Console ${msg.type()}]`, msg.text())
    })
    window.on('pageerror', err => {
      console.error('[Renderer Error]', err.message)
    })

    await window.waitForLoadState('domcontentloaded')
    await waitForAppReady(window)

    // Debug: always log page content
    const html = await window.content()
    console.log('[E2E Debug] Page HTML (first 1000 chars):', html.substring(0, 1000))

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
  // Wait for stable layout anchors that indicate the app shell is interactive
  await window.waitForSelector('h2:has-text("Spaces")', { timeout: 30000 })
  await window.waitForSelector('button[title="Settings"]', { timeout: 30000 })
}

export async function navigateTo(window: Page, destination: 'chat' | 'settings'): Promise<void> {
  if (destination === 'settings') {
    // Click the settings button in TopNavigation
    const settingsBtn = window.locator('button[title="Settings"]')
    await settingsBtn.click()
  } else {
    // Navigate to home/chat by clicking the GodCode brand
    const brand = window.locator('text=GodCode').first()
    await brand.click()
  }
  await window.waitForLoadState('networkidle')
}
