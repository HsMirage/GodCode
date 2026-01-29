export interface BrowserTool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
  execute: (params: any, context: BrowserToolContext) => Promise<ToolResult>
}

export interface BrowserToolContext {
  viewId: string
  webContents: Electron.WebContents | null
}

export interface ToolResult {
  success: boolean
  data?: any
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
