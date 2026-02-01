import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listNetworkRequestsTool,
  getNetworkRequestTool,
  type NetworkRequest
} from '@/main/services/ai-browser/tools/network'

describe('Network Tools', () => {
  const mockRequests: NetworkRequest[] = [
    {
      id: '1',
      url: 'https://api.example.com/data',
      method: 'GET',
      resourceType: 'fetch',
      status: 200,
      timing: { startTime: 0, duration: 100 }
    },
    {
      id: '2',
      url: 'https://example.com/image.png',
      method: 'GET',
      resourceType: 'image',
      status: 404,
      error: 'Not Found'
    }
  ]

  const mockContext = {
    getNetworkRequests: vi.fn(),
    getNetworkRequest: vi.fn(),
    getSelectedNetworkRequest: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.getNetworkRequests.mockReturnValue(mockRequests)
  })

  describe('listNetworkRequestsTool', () => {
    it('should list all requests', async () => {
      const result = await listNetworkRequestsTool.execute({}, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any).requests).toHaveLength(2)
      expect((result.data as any)?.output).toContain('https://api.example.com/data')
    })

    it('should filter by resource type', async () => {
      const result = await listNetworkRequestsTool.execute(
        { resourceTypes: ['image'] },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect((result.data as any).requests).toHaveLength(1)
      expect((result.data as any).requests[0].resourceType).toBe('image')
    })

    it('should handle pagination', async () => {
      const result = await listNetworkRequestsTool.execute(
        { pageSize: 1, pageIdx: 0 },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect((result.data as any).requests).toHaveLength(1)
      expect((result.data as any)?.output).toContain('Network Requests (1-1 of 2)')
    })

    it('should handle empty requests', async () => {
      mockContext.getNetworkRequests.mockReturnValue([])

      const result = await listNetworkRequestsTool.execute({}, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.message).toBe('No network requests captured.')
    })
  })

  describe('getNetworkRequestTool', () => {
    it('should get request by id', async () => {
      mockContext.getNetworkRequest.mockReturnValue(mockRequests[0])

      const result = await getNetworkRequestTool.execute({ reqid: 1 }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('Method: GET')
      expect((result.data as any)?.output).toContain('Status: 200')
    })

    it('should return error if not found', async () => {
      mockContext.getNetworkRequest.mockReturnValue(undefined)

      const result = await getNetworkRequestTool.execute({ reqid: 999 }, mockContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Request not found')
    })

    it('should get selected request when no reqid provided', async () => {
      const selectedRequest: NetworkRequest = {
        id: '3',
        url: 'https://selected.com/api',
        method: 'POST',
        resourceType: 'xhr',
        status: 201
      }
      mockContext.getSelectedNetworkRequest.mockReturnValue(selectedRequest)

      const result = await getNetworkRequestTool.execute({}, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('https://selected.com/api')
      expect((result.data as any)?.output).toContain('Method: POST')
    })

    it('should return error when no reqid and no selected request', async () => {
      mockContext.getSelectedNetworkRequest.mockReturnValue(undefined)

      const result = await getNetworkRequestTool.execute({}, mockContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Nothing is currently selected')
    })

    it('should display request with headers', async () => {
      const reqWithHeaders: NetworkRequest = {
        id: '4',
        url: 'https://api.com/data',
        method: 'GET',
        resourceType: 'fetch',
        status: 200,
        requestHeaders: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        responseHeaders: { 'Content-Length': '1234', 'X-Custom': 'value' }
      }
      mockContext.getNetworkRequest.mockReturnValue(reqWithHeaders)

      const result = await getNetworkRequestTool.execute({ reqid: 4 }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('## Request Headers')
      expect((result.data as any)?.output).toContain('Authorization: Bearer token')
      expect((result.data as any)?.output).toContain('## Response Headers')
      expect((result.data as any)?.output).toContain('Content-Length: 1234')
    })

    it('should display request body', async () => {
      const reqWithBody: NetworkRequest = {
        id: '5',
        url: 'https://api.com/submit',
        method: 'POST',
        resourceType: 'xhr',
        status: 200,
        requestBody: '{"name":"test","value":123}'
      }
      mockContext.getNetworkRequest.mockReturnValue(reqWithBody)

      const result = await getNetworkRequestTool.execute({ reqid: 5 }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('## Request Body')
      expect((result.data as any)?.output).toContain('{"name":"test","value":123}')
    })

    it('should truncate long request body', async () => {
      const longBody = 'x'.repeat(2500)
      const reqWithLongBody: NetworkRequest = {
        id: '6',
        url: 'https://api.com/large',
        method: 'POST',
        resourceType: 'xhr',
        status: 200,
        requestBody: longBody
      }
      mockContext.getNetworkRequest.mockReturnValue(reqWithLongBody)

      const result = await getNetworkRequestTool.execute({ reqid: 6 }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('## Request Body')
      expect((result.data as any)?.output).toContain('... (truncated)')
    })

    it('should display error section for failed requests', async () => {
      const reqWithError: NetworkRequest = {
        id: '7',
        url: 'https://api.com/fail',
        method: 'GET',
        resourceType: 'fetch',
        error: 'Connection refused'
      }
      mockContext.getNetworkRequest.mockReturnValue(reqWithError)

      const result = await getNetworkRequestTool.execute({ reqid: 7 }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('## Error')
      expect((result.data as any)?.output).toContain('Connection refused')
    })
  })
})
