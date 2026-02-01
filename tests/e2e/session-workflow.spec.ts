import { test, expect, navigateTo } from './fixtures/electron'

test.describe('Session Workflow', () => {
  test('chat page displays message input', async ({ window }) => {
    await navigateTo(window, 'chat')

    const textarea = window.locator('textarea')
    await expect(textarea).toBeVisible()
  })

  test('send button exists and is initially disabled', async ({ window }) => {
    await navigateTo(window, 'chat')

    const sendBtn = window.locator('button[aria-label="Send message"]')
    await expect(sendBtn).toBeVisible()
    await expect(sendBtn).toBeDisabled()
  })

  test('send button enables when message is typed', async ({ window }) => {
    await navigateTo(window, 'chat')

    const textarea = window.locator('textarea')
    await textarea.fill('Hello, this is a test message')

    const sendBtn = window.locator('button[aria-label="Send message"]')
    await expect(sendBtn).toBeEnabled()
  })

  test('view mode toggle buttons exist', async ({ window }) => {
    await navigateTo(window, 'chat')

    const chatViewBtn = window.locator('button:has-text("对话")')
    await expect(chatViewBtn).toBeVisible()

    const workflowViewBtn = window.locator('button:has-text("流程图")')
    await expect(workflowViewBtn).toBeVisible()
  })

  test('can switch between chat and workflow views', async ({ window }) => {
    await navigateTo(window, 'chat')

    const workflowViewBtn = window.locator('button:has-text("流程图")').first()
    await workflowViewBtn.click()
    await window.waitForTimeout(500)

    const workflowHeading = window.locator('h1:has-text("流程图")')
    await expect(workflowHeading).toBeVisible()

    const chatViewBtn = window.locator('button:has-text("对话")').first()
    await chatViewBtn.click()
    await window.waitForTimeout(500)

    const chatHeading = window.locator('h1:has-text("对话")')
    await expect(chatHeading).toBeVisible()
  })

  test('artifacts panel toggle works', async ({ window }) => {
    await navigateTo(window, 'chat')

    const artifactsBtn = window.locator('button:has-text("产物")')
    await expect(artifactsBtn).toBeVisible()

    await artifactsBtn.click()
    await window.waitForTimeout(500)

    const btnClass = await artifactsBtn.getAttribute('class')
    expect(btnClass).toContain('text-sky-300')
  })

  test('message input placeholder is correct', async ({ window }) => {
    await navigateTo(window, 'chat')

    const textarea = window.locator('textarea')
    const placeholder = await textarea.getAttribute('placeholder')

    expect(placeholder).toContain('输入消息')
  })
})
