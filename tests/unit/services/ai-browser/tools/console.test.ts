import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listConsoleMessagesTool,
  getConsoleMessageTool,
  type ConsoleMessage
} from '@/main/services/ai-browser/tools/console'

describe('Console Tools', () => {
  const mockMessages: ConsoleMessage[] = [
    {
      id: '1',
      type: 'log',
      text: 'Hello world',
      timestamp: 1704110400000, // 2024-01-01 12:00:00
      url: 'script.js',
      lineNumber: 10
    },
    {
      id: '2',
      type: 'error',
      text: 'Something failed',
      timestamp: 1704110405000,
      stackTrace: 'Error at function x'
    },
    {
      id: '3',
      type: 'warn',
      text: 'Warning message',
      timestamp: 1704110410000
    }
  ]

  const mockContext = {
    getConsoleMessages: vi.fn(),
    getConsoleMessage: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.getConsoleMessages.mockReturnValue(mockMessages)
  })

  describe('listConsoleMessagesTool', () => {
    it('should list all messages by default', async () => {
      const result = await listConsoleMessagesTool.execute({}, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any).messages).toHaveLength(3)
      expect((result.data as any)?.output).toContain('Hello world')
      expect((result.data as any)?.output).toContain('Something failed')
      expect(mockContext.getConsoleMessages).toHaveBeenCalledWith(false)
    })

    it('should filter messages by type', async () => {
      const result = await listConsoleMessagesTool.execute({ types: ['error'] }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any).messages).toHaveLength(1)
      expect((result.data as any).messages[0].id).toBe('2')
    })

    it('should handle pagination', async () => {
      const result = await listConsoleMessagesTool.execute(
        { pageSize: 1, pageIdx: 1 },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect((result.data as any).messages).toHaveLength(1)
      expect((result.data as any).messages[0].id).toBe('2') // Second message
      expect((result.data as any)?.output).toContain('Use pageIdx=2 to see more messages')
    })

    it('should handle empty results', async () => {
      mockContext.getConsoleMessages.mockReturnValue([])
      const result = await listConsoleMessagesTool.execute({}, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.message).toBe('No console messages captured.')
    })
  })

  describe('getConsoleMessageTool', () => {
    it('should return specific message details', async () => {
      const msg = mockMessages[1]
      mockContext.getConsoleMessage.mockReturnValue(msg)

      const result = await getConsoleMessageTool.execute({ msgid: 2 }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('# Console Message: msgid=2')
      expect((result.data as any)?.output).toContain('## Type: ERROR')
      expect((result.data as any)?.output).toContain('Stack Trace')
      expect(mockContext.getConsoleMessage).toHaveBeenCalledWith('2')
    })

    it('should return error if message not found', async () => {
      mockContext.getConsoleMessage.mockReturnValue(undefined)

      const result = await getConsoleMessageTool.execute({ msgid: 999 }, mockContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Message not found')
    })

    it('should display message with url but without lineNumber', async () => {
      const msg: ConsoleMessage = {
        id: '4',
        type: 'log',
        text: 'Test message',
        timestamp: 1704110400000,
        url: 'https://example.com/script.js'
      }
      mockContext.getConsoleMessage.mockReturnValue(msg)

      const result = await getConsoleMessageTool.execute({ msgid: 4 }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('## Source')
      expect((result.data as any)?.output).toContain('File: https://example.com/script.js')
      expect((result.data as any)?.output).not.toContain('Line:')
    })

    it('should display message with url and lineNumber', async () => {
      const msg: ConsoleMessage = {
        id: '7',
        type: 'log',
        text: 'Test message with line',
        timestamp: 1704110400000,
        url: 'https://example.com/app.js',
        lineNumber: 42
      }
      mockContext.getConsoleMessage.mockReturnValue(msg)

      const result = await getConsoleMessageTool.execute({ msgid: 7 }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('## Source')
      expect((result.data as any)?.output).toContain('File: https://example.com/app.js')
      expect((result.data as any)?.output).toContain('Line: 42')
    })

    it('should display message with args', async () => {
      const msg: ConsoleMessage = {
        id: '5',
        type: 'log',
        text: 'Logged object',
        timestamp: 1704110400000,
        args: [{ foo: 'bar' }, 123, 'string']
      }
      mockContext.getConsoleMessage.mockReturnValue(msg)

      const result = await getConsoleMessageTool.execute({ msgid: 5 }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('## Arguments')
      expect((result.data as any)?.output).toContain('"foo": "bar"')
      expect((result.data as any)?.output).toContain('123')
    })

    it('should not display args section when args array is empty', async () => {
      const msg: ConsoleMessage = {
        id: '6',
        type: 'log',
        text: 'No args message',
        timestamp: 1704110400000,
        args: []
      }
      mockContext.getConsoleMessage.mockReturnValue(msg)

      const result = await getConsoleMessageTool.execute({ msgid: 6 }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).not.toContain('## Arguments')
    })
  })
})
