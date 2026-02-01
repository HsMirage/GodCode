import { test, expect } from './fixtures/electron'

test.describe('Space Management', () => {
  test('displays space list dropdown', async ({ window }) => {
    const spaceList = window.locator('.space-list select')
    await expect(spaceList).toBeVisible()
  })

  test('create space button opens dialog', async ({ window }) => {
    const createBtn = window.locator('button[title="Create New Space"]')
    await expect(createBtn).toBeVisible()

    await createBtn.click()
    await window.waitForTimeout(500)

    const dialogTitle = window.locator('h2:has-text("Create Space")')
    await expect(dialogTitle).toBeVisible()
  })

  test('create space dialog has required form fields', async ({ window }) => {
    const createBtn = window.locator('button[title="Create New Space"]')
    await createBtn.click()
    await window.waitForTimeout(500)

    const nameInput = window.locator('input[placeholder="Space Name"]')
    await expect(nameInput).toBeVisible()

    const selectFolderBtn = window.locator('button:has-text("Select Folder")')
    await expect(selectFolderBtn).toBeVisible()

    const cancelBtn = window.getByRole('button', { name: 'Cancel' })
    await expect(cancelBtn).toBeVisible()

    const createSubmitBtn = window.locator('button:has-text("Create")')
    await expect(createSubmitBtn).toBeVisible()
  })

  test('create space dialog can be cancelled', async ({ window }) => {
    const createBtn = window.locator('button[title="Create New Space"]')
    await createBtn.click()
    await window.waitForTimeout(500)

    const dialogTitle = window.locator('h2:has-text("Create Space")')
    await expect(dialogTitle).toBeVisible()

    const cancelBtn = window.getByRole('button', { name: 'Cancel' })
    await cancelBtn.click()
    await window.waitForTimeout(300)

    await expect(dialogTitle).not.toBeVisible()
  })

  test('create button is disabled when form is empty', async ({ window }) => {
    const createBtn = window.locator('button[title="Create New Space"]')
    await createBtn.click()
    await window.waitForTimeout(500)

    const createSubmitBtn = window.locator('button:has-text("Create"):not(:has-text("Creating"))')
    await expect(createSubmitBtn).toBeDisabled()

    await window.getByRole('button', { name: 'Cancel' }).click()
  })

  test('can fill space name input', async ({ window }) => {
    const createBtn = window.locator('button[title="Create New Space"]')
    await createBtn.click()
    await window.waitForTimeout(500)

    const nameInput = window.locator('input[placeholder="Space Name"]')
    await nameInput.fill('Test E2E Space')

    await expect(nameInput).toHaveValue('Test E2E Space')

    await window.getByRole('button', { name: 'Cancel' }).click()
  })
})
