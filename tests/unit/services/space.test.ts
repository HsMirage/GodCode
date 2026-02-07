import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createSpace,
  listSpaces,
  getSpace,
  deleteSpace,
  updateSpace
} from '@/main/services/space.service'
import { DatabaseService } from '@/main/services/database'
import fs from 'fs'
import path from 'path'

// Mock dependencies
vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    rmdirSync: vi.fn()
  },
  mkdirSync: vi.fn(),
  rmdirSync: vi.fn()
}))

// Mock DatabaseService
const prismaMock = {
  $transaction: vi.fn(),
  run: {
    deleteMany: vi.fn()
  },
  task: {
    deleteMany: vi.fn()
  },
  artifact: {
    deleteMany: vi.fn()
  },
  message: {
    deleteMany: vi.fn()
  },
  session: {
    deleteMany: vi.fn()
  },
  space: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    update: vi.fn()
  }
}

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: vi.fn(() => ({
      getClient: vi.fn(() => prismaMock)
    }))
  }
}))

describe('SpaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('createSpace', () => {
    it('should create directories and database record', async () => {
      const input = { name: 'Test Space', workDir: '/tmp/test-space' }
      const mockSpace = {
        id: '123',
        name: input.name,
        workDir: input.workDir,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      prismaMock.space.create.mockResolvedValue(mockSpace)

      const result = await createSpace(input)

      // Verify fs calls
      expect(fs.mkdirSync).toHaveBeenCalledTimes(2)
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(input.workDir, '.codeall', 'artifacts'), {
        recursive: true
      })
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(input.workDir, '.codeall', 'downloads'), {
        recursive: true
      })

      // Verify DB calls
      expect(prismaMock.space.create).toHaveBeenCalledWith({
        data: {
          name: input.name,
          workDir: input.workDir
        }
      })

      expect(result).toEqual(mockSpace)
    })

    it('should propagate error if database creation fails', async () => {
      const input = { name: 'Test Space', workDir: '/tmp/test-space' }
      const error = new Error('DB Error')

      prismaMock.space.create.mockRejectedValue(error)

      await expect(createSpace(input)).rejects.toThrow(error)

      // Directories are still created before DB call in current implementation
      expect(fs.mkdirSync).toHaveBeenCalledTimes(2)
    })

    it('should propagate error if directory creation fails', async () => {
      const input = { name: 'Test Space', workDir: '/tmp/test-space' }
      const error = new Error('FS Error')

      vi.mocked(fs.mkdirSync).mockImplementationOnce(() => {
        throw error
      })

      await expect(createSpace(input)).rejects.toThrow(error)

      // DB call should not happen
      expect(prismaMock.space.create).not.toHaveBeenCalled()
    })
  })

  describe('listSpaces', () => {
    it('should return all spaces ordered by updatedAt desc', async () => {
      const mockSpaces = [
        {
          id: '1',
          name: 'Space 1',
          workDir: '/dir1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        { id: '2', name: 'Space 2', workDir: '/dir2', createdAt: new Date(), updatedAt: new Date() }
      ]

      prismaMock.space.findMany.mockResolvedValue(mockSpaces)

      const result = await listSpaces()

      expect(prismaMock.space.findMany).toHaveBeenCalledWith({
        orderBy: {
          updatedAt: 'desc'
        }
      })
      expect(result).toEqual(mockSpaces)
    })

    it('should propagate error if query fails', async () => {
      const error = new Error('DB Error')
      prismaMock.space.findMany.mockRejectedValue(error)

      await expect(listSpaces()).rejects.toThrow(error)
    })
  })

  describe('getSpace', () => {
    it('should return space if found', async () => {
      const spaceId = '123'
      const mockSpace = {
        id: spaceId,
        name: 'Space 1',
        workDir: '/dir1',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      prismaMock.space.findUnique.mockResolvedValue(mockSpace)

      const result = await getSpace(spaceId)

      expect(prismaMock.space.findUnique).toHaveBeenCalledWith({
        where: { id: spaceId }
      })
      expect(result).toEqual(mockSpace)
    })

    it('should return null if space not found', async () => {
      const spaceId = '999'
      prismaMock.space.findUnique.mockResolvedValue(null)

      const result = await getSpace(spaceId)

      expect(result).toBeNull()
    })

    it('should propagate error if query fails', async () => {
      const spaceId = '123'
      const error = new Error('DB Error')
      prismaMock.space.findUnique.mockRejectedValue(error)

      await expect(getSpace(spaceId)).rejects.toThrow(error)
    })
  })

  describe('deleteSpace', () => {
    it('should delete space from database', async () => {
      const spaceId = '123'
      prismaMock.space.delete.mockResolvedValue({ id: spaceId })

      const result = await deleteSpace(spaceId)

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
      expect(prismaMock.space.delete).toHaveBeenCalledWith({ where: { id: spaceId } })
      expect(result).toBe(true)

      // Note: Current implementation does not remove directories
    })

    it('should return false if deletion fails', async () => {
      const spaceId = '123'
      const error = new Error('DB Error')
      prismaMock.$transaction.mockRejectedValue(error)

      const result = await deleteSpace(spaceId)

      expect(result).toBe(false)
    })
  })

  describe('updateSpace', () => {
    it('should update space details', async () => {
      const spaceId = '123'
      const updates = { name: 'Updated Name' }
      const mockSpace = {
        id: spaceId,
        name: 'Updated Name',
        workDir: '/dir1',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      prismaMock.space.update.mockResolvedValue(mockSpace)

      const result = await updateSpace(spaceId, updates)

      expect(prismaMock.space.update).toHaveBeenCalledWith({
        where: { id: spaceId },
        data: updates
      })
      expect(result).toEqual(mockSpace)
    })

    it('should propagate error if update fails', async () => {
      const spaceId = '123'
      const updates = { name: 'Updated Name' }
      const error = new Error('DB Error')

      prismaMock.space.update.mockRejectedValue(error)

      await expect(updateSpace(spaceId, updates)).rejects.toThrow(error)
    })
  })
})
