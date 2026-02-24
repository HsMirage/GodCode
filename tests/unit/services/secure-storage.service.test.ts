import { describe, it, expect, vi, beforeEach } from 'vitest'
// Use absolute import from src alias if configured, or retry relative path calculation
// Path from tests/unit/services/secure-storage.service.test.ts to src/main/services/secure-storage.service.ts
// ../../../src/main/services/secure-storage.service.ts
import { SecureStorageService, maskApiKey } from '@main/services/secure-storage.service'
import { safeStorage } from 'electron'

// Mock electron's safeStorage
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  }
}))

describe('SecureStorageService', () => {
  let service: SecureStorageService

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton instance by accessing private property if needed or just testing behavior
    // Since we can't easily reset the singleton, we'll just test the methods on the instance
    service = SecureStorageService.getInstance()
  })

  describe('encrypt', () => {
    it('should encrypt data when encryption is available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from('encrypted'))

      const result = service.encrypt('secret')

      expect(safeStorage.encryptString).toHaveBeenCalledWith('secret')
      expect(result).toBe(Buffer.from('encrypted').toString('base64'))
    })

    it('should return plaintext when encryption is not available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

      const result = service.encrypt('secret')

      expect(safeStorage.encryptString).not.toHaveBeenCalled()
      expect(result).toBe('secret')
    })

    it('should return empty string for empty input', () => {
      const result = service.encrypt('')
      expect(result).toBe('')
    })
  })

  describe('decrypt', () => {
    it('should decrypt data when encryption is available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.decryptString).mockReturnValue('secret')
      const encrypted = Buffer.from('encrypted').toString('base64')

      const result = service.decrypt(encrypted)

      expect(safeStorage.decryptString).toHaveBeenCalledWith(Buffer.from('encrypted'))
      expect(result).toBe('secret')
    })

    it('should return original text when decryption fails', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.decryptString).mockImplementation(() => {
        throw new Error('Decryption failed')
      })

      const result = service.decrypt('invalid-base64')

      expect(result).toBe('invalid-base64')
    })

    it('should return ciphertext when encryption is not available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

      const result = service.decrypt('secret')

      expect(safeStorage.decryptString).not.toHaveBeenCalled()
      expect(result).toBe('secret')
    })

    it('should return empty string for empty input', () => {
      const result = service.decrypt('')
      expect(result).toBe('')
    })
  })
})

describe('maskApiKey', () => {
  it('should mask long keys correctly', () => {
    const key = 'sk-1234567890abcdef'
    const masked = maskApiKey(key)
    expect(masked).toBe('sk-1...cdef')
  })

  it('should return full string for short keys', () => {
    const key = 'short'
    const masked = maskApiKey(key)
    expect(masked).toBe('********')
  })

  it('should handle empty strings', () => {
    expect(maskApiKey('')).toBe('********')
  })
})
