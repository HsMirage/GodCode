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
import { grepTool } from './builtin/grep'
import { globTool } from './builtin/glob'
import { webFetchTool } from './builtin/webfetch'
import { bashTool } from './builtin/bash'
import { websearchTool } from './builtin/websearch'
import { lookAtTool } from './builtin/look-at'
import { lspTools } from './lsp'

// Register file operation tools
toolRegistry.register(fileReadTool)
toolRegistry.register(fileWriteTool)
toolRegistry.register(fileListTool)

// Register browser tools for AI browser automation
toolRegistry.register(browserNavigateTool)
toolRegistry.register(browserClickTool)
toolRegistry.register(browserFillTool)
toolRegistry.register(browserSnapshotTool)
toolRegistry.register(browserScreenshotTool)
toolRegistry.register(browserExtractTool)

// Register grep tool for content search
toolRegistry.register(grepTool)

// Register glob tool for file pattern matching
toolRegistry.register(globTool)

// Register webfetch tool for web content retrieval
toolRegistry.register(webFetchTool)

// Register bash tool for terminal command execution
toolRegistry.register(bashTool)

// Register websearch tool for web search
toolRegistry.register(websearchTool)

// Register look_at tool for multimodal extraction
toolRegistry.register(lookAtTool)

// Register LSP tools for code intelligence
lspTools.forEach((tool) => toolRegistry.register(tool))
