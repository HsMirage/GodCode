/*
 * Copyright (c) 2025 CodeAll. All rights reserved.
 */

import type { BrowserTool } from '../types'
import { navigateTool } from './navigation'
import { clickTool, fillTool } from './input'
import { snapshotTool, screenshotTool, extractTool } from './snapshot'

export { navigateTool } from './navigation'
export { clickTool, fillTool } from './input'
export { snapshotTool, screenshotTool, extractTool } from './snapshot'

export const allTools: BrowserTool[] = [
  navigateTool,
  clickTool,
  fillTool,
  snapshotTool,
  screenshotTool,
  extractTool
]
