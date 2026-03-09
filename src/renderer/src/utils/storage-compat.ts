import type { PersistStorage, StorageValue } from 'zustand/middleware'

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

export function readCompatibleStorageValue(primaryKey: string, legacyKey: string): string | null {
  const storage = getStorage()
  if (!storage) {
    return null
  }

  const primaryValue = storage.getItem(primaryKey)
  if (primaryValue !== null) {
    return primaryValue
  }

  const legacyValue = storage.getItem(legacyKey)
  if (legacyValue !== null) {
    try {
      storage.setItem(primaryKey, legacyValue)
    } catch {}
  }

  return legacyValue
}

export function writeCompatibleStorageValue(
  primaryKey: string,
  legacyKey: string,
  value: string
): void {
  const storage = getStorage()
  if (!storage) {
    return
  }

  storage.setItem(primaryKey, value)
  storage.setItem(legacyKey, value)
}

export function removeCompatibleStorageValue(primaryKey: string, legacyKey: string): void {
  const storage = getStorage()
  if (!storage) {
    return
  }

  storage.removeItem(primaryKey)
  storage.removeItem(legacyKey)
}

export function createCompatibleJSONStorage<T>(
  primaryKey: string,
  legacyKey: string
): PersistStorage<T> {
  return {
    getItem: () => {
      const raw = readCompatibleStorageValue(primaryKey, legacyKey)
      if (!raw) {
        return null
      }

      return JSON.parse(raw) as StorageValue<T>
    },
    setItem: (_name, value) => {
      writeCompatibleStorageValue(primaryKey, legacyKey, JSON.stringify(value))
    },
    removeItem: () => {
      removeCompatibleStorageValue(primaryKey, legacyKey)
    }
  }
}
