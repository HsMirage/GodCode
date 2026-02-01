/**
 * AI Browser Tools
 *
 * Export all tools for the AI browser service.
 */

import { navigationTools } from './navigation'
import { inputTools } from './input'
import { snapshotTools } from './snapshot'
import { consoleTools } from './console'
import { networkTools } from './network'
import { emulationTools } from './emulation'
import { performanceTools } from './performance'

// Export individual categories
export * from './navigation'
export * from './input'
export * from './snapshot'
export * from './console'
export * from './network'
export * from './emulation'
export * from './performance'

// Export all tools as a single array
export const allTools = [
  ...navigationTools,
  ...inputTools,
  ...snapshotTools,
  ...consoleTools,
  ...networkTools,
  ...emulationTools,
  ...performanceTools
]

// Log tool count for verification
console.log(`Loaded ${allTools.length} AI Browser tools`)
