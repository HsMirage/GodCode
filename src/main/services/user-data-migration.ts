import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { LEGACY_USER_DATA_DIR_NAMES } from '@/shared/brand-compat'

function directoryHasEntries(dirPath: string): boolean {
  return fs.existsSync(dirPath) && fs.readdirSync(dirPath).length > 0
}

export function migrateLegacyPackagedUserDataIfNeeded(): string | null {
  if (!app.isPackaged) {
    return null
  }

  const currentUserDataPath = app.getPath('userData')
  if (directoryHasEntries(currentUserDataPath)) {
    return null
  }

  const appDataPath = app.getPath('appData')
  const candidatePaths = [
    ...new Set(
      LEGACY_USER_DATA_DIR_NAMES.map(name => path.join(appDataPath, name)).filter(
        candidate => candidate !== currentUserDataPath
      )
    )
  ]

  const legacyUserDataPath = candidatePaths.find(directoryHasEntries)
  if (!legacyUserDataPath) {
    return null
  }

  fs.mkdirSync(currentUserDataPath, { recursive: true })
  fs.cpSync(legacyUserDataPath, currentUserDataPath, {
    recursive: true,
    force: false,
    errorOnExist: false
  })

  return legacyUserDataPath
}
