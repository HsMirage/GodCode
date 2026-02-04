export * from './tool.interface'
export * from './tool-registry'
export * from './tool-executor'
export * from './permission-policy'

import { toolRegistry } from './tool-registry'
import { fileReadTool } from './builtin/file-read'
import { fileWriteTool } from './builtin/file-write'
import { fileListTool } from './builtin/file-list'

// Register file operation tools only
// Browser tools are dynamically registered via toolExecutionService.registerBrowserTools()
// to avoid duplicate tool declarations
toolRegistry.register(fileReadTool)
toolRegistry.register(fileWriteTool)
toolRegistry.register(fileListTool)
