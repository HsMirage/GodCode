import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lookAtTool } from '@/main/services/tools/builtin/look-at'
import { multimodalLookerService } from '@/main/services/llm/multimodal-looker.service'
import type { ToolExecutionContext } from '@/main/services/tools/tool.interface'

vi.mock('@/main/services/llm/multimodal-looker.service', () => ({
  multimodalLookerService: {
    extract: vi.fn()
  }
}))

describe('lookAtTool', () => {
  const context: ToolExecutionContext = {
    workspaceDir: 'D:/AiWork/GodCode',
    sessionId: 'test-session'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error when goal is missing', async () => {
    const result = await lookAtTool.execute({ file_path: 'docs/spec.png' }, context)

    expect(result.success).toBe(false)
    expect(result.error).toContain("Missing required parameter 'goal'")
    expect(vi.mocked(multimodalLookerService.extract)).not.toHaveBeenCalled()
  })

  it('returns error when no media input provided', async () => {
    const result = await lookAtTool.execute({ goal: 'extract title' }, context)

    expect(result.success).toBe(false)
    expect(result.error).toContain("either 'file_path' or 'image_data'")
    expect(vi.mocked(multimodalLookerService.extract)).not.toHaveBeenCalled()
  })

  it('returns error when both file_path and image_data are provided', async () => {
    const result = await lookAtTool.execute(
      {
        file_path: 'docs/spec.png',
        image_data: 'data:image/png;base64,iVBORw0KGgo=',
        goal: 'extract title'
      },
      context
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain("Provide only one of 'file_path' or 'image_data'")
    expect(vi.mocked(multimodalLookerService.extract)).not.toHaveBeenCalled()
  })

  it('calls multimodal looker service with file_path', async () => {
    vi.mocked(multimodalLookerService.extract).mockResolvedValue({
      content: 'Invoice #A-1024',
      provider: 'gemini',
      model: 'gemini-1.5-flash'
    })

    const result = await lookAtTool.execute(
      {
        file_path: 'docs/invoice.pdf',
        goal: 'extract invoice number'
      },
      context
    )

    expect(result.success).toBe(true)
    expect(result.output).toBe('Invoice #A-1024')
    expect(vi.mocked(multimodalLookerService.extract)).toHaveBeenCalledWith({
      goal: 'extract invoice number',
      filePath: 'docs/invoice.pdf',
      imageData: undefined,
      workspaceDir: context.workspaceDir
    })
  })

  it('calls multimodal looker service with image_data', async () => {
    vi.mocked(multimodalLookerService.extract).mockResolvedValue({
      content: 'The sign says OPEN',
      provider: 'openai',
      model: 'gpt-4o'
    })

    const result = await lookAtTool.execute(
      {
        image_data: 'data:image/png;base64,iVBORw0KGgo=',
        goal: 'extract visible text'
      },
      context
    )

    expect(result.success).toBe(true)
    expect(result.output).toBe('The sign says OPEN')
    expect(vi.mocked(multimodalLookerService.extract)).toHaveBeenCalledWith({
      goal: 'extract visible text',
      filePath: undefined,
      imageData: 'data:image/png;base64,iVBORw0KGgo=',
      workspaceDir: context.workspaceDir
    })
  })

  it('returns error when service throws', async () => {
    vi.mocked(multimodalLookerService.extract).mockRejectedValue(new Error('upstream error'))

    const result = await lookAtTool.execute(
      {
        file_path: 'docs/invoice.pdf',
        goal: 'extract invoice number'
      },
      context
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('upstream error')
  })
})
