import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'
import { multimodalLookerService } from '@/main/services/llm/multimodal-looker.service'

export const lookAtTool: Tool = {
  definition: {
    name: 'look_at',
    description:
      'Analyze media files (images/PDF) and extract only the requested information using a dedicated multimodal subagent.',
    category: 'system',
    parameters: [
      {
        name: 'file_path',
        type: 'string',
        description: 'Path to the media file (relative to workspace or absolute path within workspace)',
        required: false
      },
      {
        name: 'image_data',
        type: 'string',
        description: 'Base64 image data or data URL (for pasted/clipboard image content)',
        required: false
      },
      {
        name: 'goal',
        type: 'string',
        description: 'What specific information to extract from the media',
        required: true
      }
    ]
  },

  async execute(
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const filePath = typeof params.file_path === 'string' ? params.file_path.trim() : ''
    const imageData = typeof params.image_data === 'string' ? params.image_data.trim() : ''
    const goal = typeof params.goal === 'string' ? params.goal.trim() : ''

    if (!goal) {
      return {
        success: false,
        output: '',
        error: "Missing required parameter 'goal'"
      }
    }

    const hasFilePath = filePath.length > 0
    const hasImageData = imageData.length > 0

    if (!hasFilePath && !hasImageData) {
      return {
        success: false,
        output: '',
        error: "Must provide either 'file_path' or 'image_data'"
      }
    }

    if (hasFilePath && hasImageData) {
      return {
        success: false,
        output: '',
        error: "Provide only one of 'file_path' or 'image_data'"
      }
    }

    try {
      const result = await multimodalLookerService.extract({
        goal,
        filePath: hasFilePath ? filePath : undefined,
        imageData: hasImageData ? imageData : undefined,
        workspaceDir: context.workspaceDir
      })

      return {
        success: true,
        output: result.content
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
