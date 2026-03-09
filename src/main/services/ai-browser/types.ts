/**
 * @license
 * Copyright (c) 2024-2026 openkursar
 *
 * This file is adapted from hello-halo
 * Original source: https://github.com/openkursar/halo
 * License: MIT
 *
 * Released under the MIT License
 *
 * Modified by GodCode project.
 */

export interface JsonSchemaProperty {
  type: string
  description?: string
  enum?: string[]
  default?: unknown
  minimum?: number
  maximum?: number
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  nullable?: boolean
}

export interface BrowserTool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, JsonSchemaProperty>
    required?: string[]
  }
  execute: (params: Record<string, unknown>, context: BrowserToolContext) => Promise<ToolResult>
}

export interface BrowserToolContext {
  viewId: string
  webContents: Electron.WebContents | null
  workspaceDir?: string
  sessionId?: string
  traceId?: string
  taskId?: string
  runId?: string
  setActiveViewId?: (viewId: string) => void
  waitForText?: (text: string, timeoutMs?: number) => Promise<void>
  getPendingDialog?: () => unknown
  handleDialog?: (accept: boolean, promptText?: string) => Promise<void>
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface AccessibilityNode {
  uid: string
  role: string
  name?: string
  value?: string
  description?: string
  children?: AccessibilityNode[]
}

export interface NavigateParams {
  url: string
}

export interface ClickParams {
  uid: string
}

export interface FillParams {
  uid: string
  value: string
}

export interface ExtractResult {
  text: string
  links: Array<{ text: string; url: string }>
}
