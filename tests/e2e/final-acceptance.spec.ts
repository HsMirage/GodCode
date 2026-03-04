import { test, expect, navigateTo } from './fixtures/electron'

test('final acceptance: complete user journey', async ({ window }) => {
  const ts = Date.now()
  const providerName = `E2E Final Provider ${ts}`
  const modelName = `e2e-final-model-${ts}`

  const createSpaceBtn = window.locator('button[title="New Space"]')
  await createSpaceBtn.click()

  await navigateTo(window, 'settings')

  const addProviderBtn = window.locator('button:has-text("Add Provider")').first()
  await expect(addProviderBtn).toBeVisible()
  await addProviderBtn.click()

  await window.locator('input[placeholder="My Provider"]').fill(providerName)
  await window.locator('input[placeholder="https://api.example.com/v1"]').fill('https://api.openai.com/v1')
  await window.locator('input[placeholder="sk-..."]').fill(`sk-e2e-final-${ts}`)

  const modelInput = window.locator('input[placeholder="例如: gpt-4, claude-3-opus..."]')
  await modelInput.fill(modelName)
  await window.locator('button:has-text("添加模型")').first().click()

  const saveProviderBtn = window.locator('button:has-text("Save Provider")').first()
  await saveProviderBtn.click()

  const providerCard = window
    .locator('div')
    .filter({ has: window.locator(`h4:has-text("${providerName}")`) })
    .first()
  await expect(providerCard).toBeVisible()

  const getModelId = async () =>
    window.evaluate(async targetModelName => {
      const api = (window as unknown as {
        codeall?: {
          invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
        }
      }).codeall
      if (!api) return null
      const models = (await api.invoke('model:list')) as Array<{ id: string; modelName: string }>
      return models.find(model => model.modelName === targetModelName)?.id ?? null
    }, modelName)

  await expect.poll(getModelId).not.toBeNull()
  const modelId = await getModelId()
  if (!modelId) throw new Error(`Failed to resolve model id for ${modelName}`)

  await window.evaluate(async targetModelId => {
    const api = (window as unknown as {
      codeall?: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      }
    }).codeall
    if (!api) return
    await api.invoke('setting:set', { key: 'defaultModelId', value: targetModelId })
  }, modelId)

  await navigateTo(window, 'chat')

  const textarea = window.locator('textarea')
  await expect(textarea).toBeEnabled()
  const prompt = `E2E final acceptance message ${Date.now()}`
  await textarea.fill(prompt)
  await window.keyboard.press('Enter')

  await expect(window.locator(`text=${prompt}`).first()).toBeVisible()
})

test('luban repeated sends stay stable with responses default model', async ({ window }) => {
  const ts = Date.now()
  const providerName = `E2E LuBan Provider ${ts}`
  const modelName = `e2e-luban-model-${ts}`

  const createSpaceBtn = window.locator('button[title="New Space"]')
  await createSpaceBtn.click()

  await navigateTo(window, 'settings')

  const addProviderBtn = window.locator('button:has-text("Add Provider")').first()
  await expect(addProviderBtn).toBeVisible()
  await addProviderBtn.click()

  await window.locator('input[placeholder="My Provider"]').fill(providerName)
  await window.locator('input[placeholder="https://api.example.com/v1"]').fill('https://api.fuxi-e2e.local/v1')
  await window.locator('input[placeholder="sk-..."]').fill(`sk-e2e-luban-${ts}`)

  const modelInput = window.locator('input[placeholder="例如: gpt-4, claude-3-opus..."]')
  await modelInput.fill(modelName)
  await window.locator('button:has-text("添加模型")').first().click()
  await window.locator('button:has-text("Save Provider")').first().click()

  const getModelId = async () =>
    window.evaluate(async targetModelName => {
      const api = (window as unknown as {
        codeall?: {
          invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
        }
      }).codeall
      if (!api) return null
      const models = (await api.invoke('model:list')) as Array<{ id: string; modelName: string }>
      return models.find(model => model.modelName === targetModelName)?.id ?? null
    }, modelName)

  await expect.poll(getModelId).not.toBeNull()
  const modelId = await getModelId()
  if (!modelId) throw new Error(`Failed to resolve model id for ${modelName}`)

  await window.evaluate(async targetModelId => {
    const api = (window as unknown as {
      codeall?: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      }
    }).codeall
    if (!api) return
    await api.invoke('setting:set', { key: 'defaultModelId', value: targetModelId })
  }, modelId)

  await navigateTo(window, 'chat')

  const agentSelector = window.locator('button[title^="当前智能体:"]').first()
  await expect(agentSelector).toBeVisible()
  await agentSelector.click()
  await window.getByRole('button', { name: /\(luban\)/i }).click()
  await expect(agentSelector).toHaveAttribute('title', /鲁班/)

  const ensureChatInputReady = async () => {
    await window.getByRole('button', { name: '对话' }).first().click()
    await expect(window.getByRole('heading', { level: 1, name: '对话' })).toBeVisible()
    const input = window.locator('textarea[placeholder*="输入消息"]').first()
    await expect(input).toBeVisible()
    await expect(input).toBeEnabled()
    return input
  }

  for (let i = 0; i < 20; i += 1) {
    const prompt = `E2E repeated message ${i + 1} ${Date.now()}`
    const textarea = await ensureChatInputReady()
    await textarea.fill(prompt)
    await window.keyboard.press('Enter')
    await expect(window.locator(`text=${prompt}`).first()).toBeVisible()
  }

  await expect(window.locator('text=legacy').first()).toHaveCount(0)
})
