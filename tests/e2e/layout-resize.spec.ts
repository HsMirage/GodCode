import { test, expect } from './fixtures/electron'

async function ensurePanelOpen(window: any, keyword: string) {
  const toggle = window.locator(`button[title*="${keyword}"]`).first()
  await expect(toggle).toBeVisible()
  const title = (await toggle.getAttribute('title')) ?? ''
  if (title.includes('打开')) {
    await toggle.click()
  }
}

test.describe('Main Layout - Resizable Panels', () => {
  test('can resize sidebar width and keep chat visible', async ({ window }) => {
    // First separator should be between sidebar and chat
    const sep = window.locator('[role="separator"]').first()
    await expect(sep).toBeVisible()

    const box = await sep.boundingBox()
    expect(box).toBeTruthy()

    const startX = (box?.x ?? 0) + (box?.width ?? 0) / 2
    const startY = (box?.y ?? 0) + (box?.height ?? 0) / 2

    await window.mouse.move(startX, startY)
    await window.mouse.down()
    await window.mouse.move(startX + 240, startY, { steps: 10 })
    await window.mouse.up()

    // Chat header should remain visible after resize
    await expect(window.locator('h1:has-text("对话")')).toBeVisible()
  })

  test('browser stays on far right and can resize vs task', async ({ window }) => {
    await ensurePanelOpen(window, '任务面板')
    await ensurePanelOpen(window, '浏览器')

    // Panels should render
    const taskHeader = window.locator('text=任务').first()
    const browserHeader = window.locator('text=浏览器预览').first()
    await expect(taskHeader).toBeVisible()
    await expect(browserHeader).toBeVisible()

    // Browser should be visually to the right of task
    const taskBox = await taskHeader.boundingBox()
    const browserBox = await browserHeader.boundingBox()
    expect(taskBox).toBeTruthy()
    expect(browserBox).toBeTruthy()
    expect((browserBox?.x ?? 0)).toBeGreaterThan((taskBox?.x ?? 0))

    // Drag the last separator (between task and browser) to resize
    const separators = window.locator('[role="separator"]')
    const count = await separators.count()
    expect(count).toBeGreaterThanOrEqual(2)

    const sep = separators.nth(count - 1)
    const box = await sep.boundingBox()
    expect(box).toBeTruthy()

    const startX = (box?.x ?? 0) + (box?.width ?? 0) / 2
    const startY = (box?.y ?? 0) + (box?.height ?? 0) / 2

    await window.mouse.move(startX, startY)
    await window.mouse.down()
    await window.mouse.move(startX - 200, startY, { steps: 10 })
    await window.mouse.up()

    await expect(taskHeader).toBeVisible()
    await expect(browserHeader).toBeVisible()
  })
})

