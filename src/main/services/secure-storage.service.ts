import { safeStorage } from 'electron'

export class SecureStorageService {
  private static instance: SecureStorageService | null = null

  private constructor() {}

  static getInstance(): SecureStorageService {
    if (!SecureStorageService.instance) {
      SecureStorageService.instance = new SecureStorageService()
    }
    return SecureStorageService.instance
  }

  isEncryptionAvailable(): boolean {
    // In unit/integration tests or non-Electron contexts, `electron.safeStorage` may be missing.
    // Treat encryption as unavailable in that case and fall back to plaintext behavior.
    try {
      if (!safeStorage) return false
      if (typeof safeStorage.isEncryptionAvailable !== 'function') return false
      if (typeof safeStorage.encryptString !== 'function') return false
      if (typeof safeStorage.decryptString !== 'function') return false
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  encrypt(plaintext: string): string {
    if (!plaintext) {
      return ''
    }

    if (!this.isEncryptionAvailable()) {
      console.warn('[SecureStorage] safeStorage is not available. Returning plaintext.')
      return plaintext
    }

    try {
      const buffer = safeStorage.encryptString(plaintext)
      return buffer.toString('base64')
    } catch (error) {
      console.error('[SecureStorage] Encryption failed:', error)
      throw new Error('Failed to encrypt data')
    }
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext) {
      return ''
    }

    if (!this.isEncryptionAvailable()) {
      // If encryption is not available, we assume the data is plaintext
      // This happens in dev mode or if safeStorage is disabled
      return ciphertext
    }

    const looksEncryptedBase64 = /^[A-Za-z0-9+/=]+$/.test(ciphertext) && ciphertext.length % 4 === 0

    try {
      const buffer = Buffer.from(ciphertext, 'base64')
      return safeStorage.decryptString(buffer)
    } catch (error) {
      // If decryption fails, it might be plaintext (legacy data or dev mode fallback)
      if (looksEncryptedBase64) {
        console.warn('[SecureStorage] Decryption failed, returning original text:', error)
      }
      return ciphertext
    }
  }
}

export function maskApiKey(key: string): string {
  if (!key) {
    return '********'
  }

  if (key.length < 8) {
    return '********'
  }

  const first4 = key.slice(0, 4)
  const last4 = key.slice(-4)
  return `${first4}...${last4}`
}
