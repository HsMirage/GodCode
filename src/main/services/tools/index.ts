export * from './tool.interface'
export * from './tool-registry'
export * from './tool-executor'
export * from './permission-policy'

import { toolRegistry } from './tool-registry'
import { fileReadTool } from './builtin/file-read'
import { fileWriteTool } from './builtin/file-write'
import { fileListTool } from './builtin/file-list'
import {
  browserNavigateTool,
  browserClickTool,
  browserFillTool,
  browserSnapshotTool,
  browserScreenshotTool,
  browserExtractTool
} from './builtin/browser-tools'

toolRegistry.register(fileReadTool)
toolRegistry.register(fileWriteTool)
toolRegistry.register(fileListTool)

toolRegistry.register(browserNavigateTool)
toolRegistry.register(browserClickTool)
toolRegistry.register(browserFillTool)
toolRegistry.register(browserSnapshotTool)
toolRegistry.register(browserScreenshotTool)
toolRegistry.register(browserExtractTool)
