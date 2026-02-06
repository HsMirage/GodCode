import fs from 'fs/promises'
import path from 'path'
import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'
import { ArtifactService } from '../../artifact.service'

function buildUnifiedDiff(
  relativePath: string,
  previousContent: string,
  nextContent: string,
  changeType: 'created' | 'modified'
): string {
  const normalizedPath = relativePath.replace(/\\/g, '/')
  const oldLines = previousContent.replace(/\r\n/g, '\n').split('\n')
  const newLines = nextContent.replace(/\r\n/g, '\n').split('\n')

  if (changeType === 'created') {
    return [
      '--- /dev/null',
      `+++ b/${normalizedPath}`,
      `@@ -0,0 +1,${newLines.length} @@`,
      ...newLines.map(line => `+${line}`)
    ].join('\n')
  }

  return [
    `--- a/${normalizedPath}`,
    `+++ b/${normalizedPath}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map(line => `-${line}`),
    ...newLines.map(line => `+${line}`)
  ].join('\n')
}

export const fileWriteTool: Tool = {
  definition: {
    name: 'file_write',
    description: 'Write content to a file',
    category: 'file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file to write (relative to workspace)',
        required: true
      },
      {
        name: 'content',
        type: 'string',
        description: 'Content to write to the file',
        required: true
      }
    ]
  },

  async execute(
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    try {
      const filePath = path.resolve(context.workspaceDir, params.path)
      const artifactService = ArtifactService.getInstance()

      if (!filePath.startsWith(context.workspaceDir)) {
        return {
          success: false,
          output: '',
          error: 'Access denied: path outside workspace'
        }
      }

      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })

      let previousContent: string | null = null
      let changeType: 'created' | 'modified' = 'created'

      try {
        previousContent = await fs.readFile(filePath, 'utf-8')
        changeType = 'modified'
      } catch {
        previousContent = null
        changeType = 'created'
      }

      await fs.writeFile(filePath, params.content, 'utf-8')

      const normalizedPath = String(params.path).replace(/\\/g, '/')
      const content = String(params.content)
      const hasChanged = changeType === 'created' || previousContent !== content

      if (hasChanged) {
        const diff = buildUnifiedDiff(normalizedPath, previousContent ?? '', content, changeType)

        void artifactService
          .createArtifact({
            sessionId: context.sessionId,
            type: 'file',
            path: normalizedPath,
            content,
            changeType,
            diff
          })
          .catch(() => {
            // Avoid failing the file write tool if artifact persistence fails.
            // Tool caller can still rely on the file being written.
          })
      }

      return {
        success: true,
        output: `File written successfully: ${params.path}`,
        metadata: {
          path: params.path,
          size: Buffer.byteLength(content, 'utf8'),
          changeType
        }
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
