import { test, expect, navigateTo } from './fixtures/electron'

test.describe('Session Workflow', () => {
  test('chat page displays message input', async ({ window }) => {
    // Already on chat page by default
    const textarea = window.locator('textarea')
    await expect(textarea).toBeVisible()
  })

  test('sidebar shows sessions list', async ({ window }) => {
    // Check sessions header - use more specific selector
    const sessionsHeader = window.locator('h2:has-text("Sessions")')
    await expect(sessionsHeader).toBeVisible()

    // Check new chat button
    const newChatBtn = window.locator('button[title="New Chat"]')
    await expect(newChatBtn).toBeVisible()
  })

  test('can type in message input', async ({ window }) => {
    const textarea = window.locator('textarea')
    await textarea.fill('Hello, this is a test message')
    await expect(textarea).toHaveValue('Hello, this is a test message')
  })

  test('no active sessions message shows when empty', async ({ window }) => {
    // In test environment with no database, should show empty state
    const emptyState = window.locator('text=No active sessions')
    await expect(emptyState).toBeVisible()
  })

  test('top navigation shows create space button', async ({ window }) => {
    // Check the create space button (Plus icon)
    const createSpaceBtn = window.locator('button[title="Create New Space"]')
    await expect(createSpaceBtn).toBeVisible()
  })
})
