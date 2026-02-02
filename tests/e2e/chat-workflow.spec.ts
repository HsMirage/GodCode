import { test, expect, navigateTo } from './fixtures/electron'

test.describe('Chat Workflow', () => {
  test('send message streams assistant response', async ({ window }) => {
    await navigateTo(window, 'chat')

    const textarea = window.locator('textarea')
    const sendBtn = window.getByRole('button', { name: 'Send message' })
    const assistantLabels = window.locator('span:has-text("CodeAll")')
    const initialAssistantCount = await assistantLabels.count()

    const message = `E2E chat test ${Date.now()}`
    await textarea.fill(message)
    await expect(sendBtn).toBeEnabled()
    await sendBtn.click()

    await expect(window.locator(`text=${message}`)).toBeVisible()
    await expect(assistantLabels).toHaveCount(initialAssistantCount + 1, { timeout: 60000 })

    const latestAssistantLabel = assistantLabels.nth(initialAssistantCount)
    const assistantColumn = latestAssistantLabel.locator('..').locator('..')
    const assistantBubble = assistantColumn.locator('div').nth(1)
    await expect(assistantBubble).toBeVisible()
    await expect(assistantBubble).toContainText(/\S/)
  })
})
