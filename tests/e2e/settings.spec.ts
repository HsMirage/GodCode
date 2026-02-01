import { test, expect, navigateTo } from './fixtures/electron'

test.describe('Settings Configuration', () => {
  test('navigates to settings page', async ({ window }) => {
    await navigateTo(window, 'settings')

    const heading = window.locator('h2:has-text("LLM配置")')
    await expect(heading).toBeVisible()
  })

  test('settings page has tab navigation', async ({ window }) => {
    await navigateTo(window, 'settings')

    const llmTab = window.locator('button:has-text("LLM配置")')
    await expect(llmTab).toBeVisible()

    const keysTab = window.locator('button:has-text("API密钥")')
    await expect(keysTab).toBeVisible()

    const rulesTab = window.locator('button:has-text("路由规则")')
    await expect(rulesTab).toBeVisible()
  })

  test('can switch to API Keys tab', async ({ window }) => {
    await navigateTo(window, 'settings')

    const keysTab = window.locator('button:has-text("API密钥")')
    await keysTab.click()
    await window.waitForTimeout(300)

    const keysHeading = window.locator('h2:has-text("API密钥")')
    await expect(keysHeading).toBeVisible()
  })

  test('can switch to routing rules tab', async ({ window }) => {
    await navigateTo(window, 'settings')

    const rulesTab = window.locator('button:has-text("路由规则")')
    await rulesTab.click()
    await window.waitForTimeout(300)

    const rulesHeading = window.locator('h2:has-text("路由规则")')
    await expect(rulesHeading).toBeVisible()
  })

  test('routing rules tab has add rule button', async ({ window }) => {
    await navigateTo(window, 'settings')

    const rulesTab = window.locator('button:has-text("路由规则")')
    await rulesTab.click()
    await window.waitForTimeout(300)

    const addRuleBtn = window.locator('button:has-text("新建规则")')
    await expect(addRuleBtn).toBeVisible()
  })

  test('routing rules tab shows rule form', async ({ window }) => {
    await navigateTo(window, 'settings')

    const rulesTab = window.locator('button:has-text("路由规则")')
    await rulesTab.click()
    await window.waitForTimeout(300)

    const patternLabel = window.locator('span:has-text("Pattern")')
    await expect(patternLabel).toBeVisible()

    const strategyLabel = window.locator('span:has-text("Strategy")')
    await expect(strategyLabel).toBeVisible()
  })

  test('LLM config has model studio section', async ({ window }) => {
    await navigateTo(window, 'settings')

    const modelStudio = window.locator('text=Model Studio')
    await expect(modelStudio).toBeVisible()
  })
})
