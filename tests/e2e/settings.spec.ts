import { test, expect, navigateTo } from './fixtures/electron'

test.describe('Settings Configuration', () => {
  test('navigates to settings page', async ({ window }) => {
    await navigateTo(window, 'settings')

    const providerTab = window.locator('text=API服务商').first()
    await expect(providerTab).toBeVisible()
  })

  test('can click settings button', async ({ window }) => {
    const settingsBtn = window.locator('button[title="Settings"]')
    await expect(settingsBtn).toBeVisible()
    await settingsBtn.click()
    await expect(window.locator('text=API服务商').first()).toBeVisible()
  })

  test('CodeAll branding visible in top nav', async ({ window }) => {
    const branding = window.locator('text=CodeAll').first()
    await expect(branding).toBeVisible()
  })

  test('can create provider model from settings', async ({ window }) => {
    await navigateTo(window, 'settings')

    const addProviderBtn = window.locator('button:has-text("Add Provider")').first()
    await expect(addProviderBtn).toBeVisible()
    await addProviderBtn.click()

    const ts = Date.now()
    await window.locator('input[placeholder="My Provider"]').fill(`E2E Provider ${ts}`)
    await window.locator('input[placeholder="https://api.example.com/v1"]').fill('https://api.openai.com/v1')
    await window.locator('input[placeholder="sk-..."]').fill(`sk-e2e-${ts}`)

    const modelInput = window.locator('input[placeholder="例如: gpt-4, claude-3-opus..."]')
    await modelInput.fill(`e2e-model-${ts}`)
    await window.locator('button:has-text("添加模型")').first().click()

    const saveProviderBtn = window.locator('button:has-text("Save Provider")').first()
    await saveProviderBtn.click()

    const providerCard = window
      .locator('div')
      .filter({ has: window.locator(`h4:has-text("E2E Provider ${ts}")`) })
      .first()
    await expect(providerCard).toBeVisible()
  })

  test('newly added model uses responses as default OpenAI protocol', async ({ window }) => {
    await navigateTo(window, 'settings')

    const addProviderBtn = window.locator('button:has-text("Add Provider")').first()
    await expect(addProviderBtn).toBeVisible()
    await addProviderBtn.click()

    const ts = Date.now()
    const providerName = `E2E Protocol Provider ${ts}`
    const baseUrl = 'https://api.protocol-e2e.local/v1'
    await window.locator('input[placeholder="My Provider"]').fill(providerName)
    await window.locator('input[placeholder="https://api.example.com/v1"]').fill(baseUrl)
    await window.locator('input[placeholder="sk-..."]').fill(`sk-e2e-protocol-${ts}`)

    const initialModelName = `e2e-protocol-model-${ts}`
    await window.locator('input[placeholder="例如: gpt-4, claude-3-opus..."]').fill(initialModelName)
    await window.locator('button:has-text("添加模型")').first().click()
    await window.locator('button:has-text("Save Provider")').first().click()

    const providerCard = window
      .locator('div')
      .filter({ has: window.locator(`h4:has-text("${providerName}")`) })
      .first()
    await expect(providerCard).toBeVisible()

    const readProtocol = async () =>
      window.evaluate(async (targetModelName: string) => {
        const api = (window as unknown as { codeall?: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } }).codeall
        if (!api) return null
        const models = (await api.invoke('model:list')) as Array<{
          modelName?: string
          config?: { apiProtocol?: string }
        }>
        const matched = models.find(model => model?.modelName === targetModelName)
        return matched?.config?.apiProtocol ?? null
      }, initialModelName)

    await expect.poll(readProtocol).toBe('responses')

    await navigateTo(window, 'chat')
    await navigateTo(window, 'settings')

    await expect.poll(readProtocol).toBe('responses')
  })
})
