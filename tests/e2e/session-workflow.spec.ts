import { test, expect, navigateTo } from './fixtures/electron'
import path from 'path'
import fs from 'fs'

test.describe('Session Workflow', () => {
  test.beforeEach(async ({ window }) => {
    const createSpaceBtn = window.locator('button[title="New Space"]')
    await createSpaceBtn.click()
  })

  test('chat page displays message input', async ({ window }) => {
    const textarea = window.locator('textarea')
    await expect(textarea).toBeVisible()
  })

  test('sidebar shows sessions list', async ({ window }) => {
    const sessionsHeader = window.locator('h2:has-text("Spaces")')
    await expect(sessionsHeader).toBeVisible()

    const newChatBtn = window.locator('button[title="新对话"]')
    await expect(newChatBtn).toBeVisible()
  })

  test('can type in message input', async ({ window }) => {
    const textarea = window.locator('textarea')
    await expect(textarea).toBeEnabled()
    await textarea.fill('Hello, this is a test message')
    await expect(textarea).toHaveValue('Hello, this is a test message')
  })

  test('shows initial session after creating space', async ({ window }) => {
    await expect(window.locator('text=新对话 1').first()).toBeVisible()
  })

  test('top navigation shows create space button', async ({ window }) => {
    const createSpaceBtn = window.locator('button[title="New Space"]')
    await expect(createSpaceBtn).toBeVisible()
  })

  test('can bind default model and send message', async ({ window }) => {
    await navigateTo(window, 'settings')

    const ts = Date.now()
    const providerName = `E2E Workflow Provider ${ts}`
    const modelName = `e2e-model-${ts}`

    await window.locator('button:has-text("Add Provider")').first().click()
    await window.locator('input[placeholder="My Provider"]').fill(providerName)
    await window
      .locator('input[placeholder="https://api.example.com/v1"]')
      .fill('https://api.workflow-e2e.local/v1')
    await window.locator('input[placeholder="sk-..."]').fill(`sk-e2e-workflow-${ts}`)
    await window.locator('input[placeholder="例如: gpt-4, claude-3-opus..."]').fill(modelName)
    await window.locator('button:has-text("添加模型")').first().click()
    await window.locator('button:has-text("Save Provider")').first().click()

    const getModelId = async () =>
      window.evaluate(async targetModelName => {
        const api = (
          window as unknown as {
            godcode?: {
              invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
            }
          }
        ).godcode
        if (!api) return null
        const models = (await api.invoke('model:list')) as Array<{ id: string; modelName: string }>
        return models.find(model => model.modelName === targetModelName)?.id ?? null
      }, modelName)

    await expect.poll(getModelId).not.toBeNull()
    const modelId = await getModelId()
    if (!modelId) throw new Error(`Failed to resolve model id for ${modelName}`)

    await window.evaluate(async targetModelId => {
      const api = (
        window as unknown as {
          godcode?: {
            invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
          }
        }
      ).godcode
      if (!api) return
      await api.invoke('setting:set', { key: 'defaultModelId', value: targetModelId })
    }, modelId)

    await navigateTo(window, 'chat')

    const textarea = window.locator('textarea')
    await expect(textarea).toBeEnabled()
    const prompt = `E2E workflow message ${Date.now()}`
    await textarea.fill(prompt)
    await window.keyboard.press('Enter')

    await expect(window.locator(`text=${prompt}`).first()).toBeVisible()
  })

  test('still sends successfully after agent/category reset with system default model', async ({
    window
  }) => {
    await navigateTo(window, 'settings')

    const addProviderBtn = window.locator('button:has-text("Add Provider")').first()
    await expect(addProviderBtn).toBeVisible()
    await addProviderBtn.click()

    const ts = Date.now()
    const providerName = `E2E Reset Provider ${ts}`
    const modelName = `e2e-reset-model-${ts}`

    await window.locator('input[placeholder="My Provider"]').fill(providerName)
    await window
      .locator('input[placeholder="https://api.example.com/v1"]')
      .fill('https://api.reset-e2e.local/v1')
    await window.locator('input[placeholder="sk-..."]').fill(`sk-e2e-reset-${ts}`)
    await window.locator('input[placeholder="例如: gpt-4, claude-3-opus..."]').fill(modelName)
    await window.locator('button:has-text("添加模型")').first().click()
    await window.locator('button:has-text("Save Provider")').first().click()

    const getModelId = async () =>
      window.evaluate(async targetModelName => {
        const api = (
          window as unknown as {
            godcode?: {
              invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
            }
          }
        ).godcode
        if (!api) return null
        const models = (await api.invoke('model:list')) as Array<{ id: string; modelName: string }>
        return models.find(model => model.modelName === targetModelName)?.id ?? null
      }, modelName)

    await expect.poll(getModelId).not.toBeNull()
    const modelId = await getModelId()
    if (!modelId) throw new Error(`Failed to resolve model id for ${modelName}`)

    await window.evaluate(async targetModelId => {
      const api = (
        window as unknown as {
          godcode?: {
            invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
          }
        }
      ).godcode
      if (!api) return
      await api.invoke('setting:set', { key: 'defaultModelId', value: targetModelId })
    }, modelId)

    window.on('dialog', dialog => {
      void dialog.accept()
    })

    await window.locator('button:has-text("智能体")').first().click()
    await window.locator('h3:has-text("伏羲")').first().click()
    await window.locator('button:has-text("重置默认")').first().click()

    await window.locator('button:has-text("任务类别")').first().click()
    await window.locator('h3:has-text("大禹")').first().click()
    await window.locator('button:has-text("重置默认")').first().click()

    await navigateTo(window, 'chat')

    const textarea = window.locator('textarea')
    await expect(textarea).toBeEnabled()
    const prompt = `E2E reset fallback message ${Date.now()}`
    await textarea.fill(prompt)
    await window.keyboard.press('Enter')

    await expect(window.locator(`text=${prompt}`).first()).toBeVisible()
  })

  test('manual resume sends continuation prompt through message pipeline', async ({ window }) => {
    const resolveSessionId = async () =>
      window.evaluate(async () => {
        const api = (
          window as unknown as {
            godcode?: {
              invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
            }
          }
        ).godcode

        if (!api) return null

        const sessions = (await api.invoke('session:list')) as Array<{ id?: string }>
        const firstId = sessions.find(
          session => typeof session?.id === 'string' && session.id.length > 0
        )?.id

        return firstId ?? null
      })

    await expect.poll(resolveSessionId).not.toBeNull()
    const sessionId = await resolveSessionId()

    if (!sessionId) {
      throw new Error('Failed to resolve current session id for continuation test')
    }

    const boulderPath = path.join(
      process.env.GODCODE_E2E_SPACE_DIR ?? process.env.CODEALL_E2E_SPACE_DIR ?? process.cwd(),
      '.fuxi',
      'boulder.json'
    )
    fs.mkdirSync(path.dirname(boulderPath), { recursive: true })
    fs.writeFileSync(
      boulderPath,
      JSON.stringify(
        {
          active_plan: '/tmp/.fuxi/plans/e2e-r9.md',
          session_ids: [sessionId]
        },
        null,
        2
      ),
      'utf-8'
    )

    await window.evaluate(async targetSessionId => {
      const api = (
        window as unknown as {
          godcode?: {
            invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
          }
        }
      ).godcode

      if (!api) {
        throw new Error('window.godcode is unavailable')
      }

      await api.invoke('task-continuation:set-todos', {
        sessionId: targetSessionId,
        todos: [
          {
            id: 'r9-manual-resume',
            content: 'resume pending task',
            status: 'pending',
            priority: 'high'
          }
        ]
      })
    }, sessionId)

    await navigateTo(window, 'settings')
    await navigateTo(window, 'chat')

    const selectCurrentSession = window
      .locator('div')
      .filter({ has: window.locator(`span:has-text("新对话 1")`) })
      .first()
      .locator('button')
      .first()
    await selectCurrentSession.click()

    const resumeButton = window.locator('button:has-text("Resume Session")')
    await expect(resumeButton).toBeVisible()

    await expect
      .poll(async () => {
        return window.evaluate(async targetSessionId => {
          const api = (
            window as unknown as {
              godcode?: {
                invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
              }
            }
          ).godcode

          if (!api) return null

          const status = (await api.invoke('task-continuation:get-status', targetSessionId)) as {
            continuationPrompt?: string
          }

          return status?.continuationPrompt ?? null
        }, sessionId)
      })
      .not.toBeNull()

    const expectedContinuationPrompt = await window.evaluate(async targetSessionId => {
      const api = (
        window as unknown as {
          godcode?: {
            invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
          }
        }
      ).godcode

      if (!api) return null

      const status = (await api.invoke('task-continuation:get-status', targetSessionId)) as {
        continuationPrompt?: string
      }

      return status?.continuationPrompt ?? null
    }, sessionId)

    if (!expectedContinuationPrompt) {
      throw new Error('Continuation prompt was not available before resume click')
    }

    await resumeButton.click()

    await expect
      .poll(async () => {
        return window.evaluate(
          async ({ targetSessionId, prompt }) => {
            const api = (
              window as unknown as {
                godcode?: {
                  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
                }
              }
            ).godcode

            if (!api) return false

            const messages = (await api.invoke('message:list', targetSessionId)) as Array<{
              role?: string
              content?: string
            }>

            return messages.some(message => message.role === 'user' && message.content === prompt)
          },
          { targetSessionId: sessionId, prompt: expectedContinuationPrompt }
        )
      })
      .toBe(true)
  })
})
