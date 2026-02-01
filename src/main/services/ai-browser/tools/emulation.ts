/**
 * Emulation Tools - Device and network emulation
 *
 * Adapted from hello-halo (https://github.com/openkursar/halo)
 * Copyright (c) OpenKursar
 * Licensed under MIT
 */

import type { BrowserTool, ToolResult } from '../types'

// Predefined network conditions (aligned with chrome-devtools-mcp)
const NETWORK_CONDITIONS = {
  'Slow 3G': { download: (500 * 1024) / 8, upload: (500 * 1024) / 8, latency: 400 },
  'Fast 3G': { download: (1.6 * 1024 * 1024) / 8, upload: (750 * 1024) / 8, latency: 150 },
  'Regular 4G': { download: (4 * 1024 * 1024) / 8, upload: (3 * 1024 * 1024) / 8, latency: 20 },
  DSL: { download: (2 * 1024 * 1024) / 8, upload: (1 * 1024 * 1024) / 8, latency: 5 },
  WiFi: { download: (30 * 1024 * 1024) / 8, upload: (15 * 1024 * 1024) / 8, latency: 2 }
} as const

const THROTTLING_OPTIONS = ['No emulation', 'Offline', ...Object.keys(NETWORK_CONDITIONS)] as const

/**
 * emulate - Emulate various features on the selected page
 * Aligned with chrome-devtools-mcp: emulate
 */
export const emulateTool: BrowserTool = {
  name: 'browser_emulate',
  description: `Emulates various features on the selected page.`,
  parameters: {
    type: 'object',
    properties: {
      networkConditions: {
        type: 'string',
        description:
          'Throttle network. Set to "No emulation" to disable. If omitted, conditions remain unchanged.',
        // @ts-ignore
        enum: THROTTLING_OPTIONS as unknown as string[]
      },
      cpuThrottlingRate: {
        type: 'number',
        description:
          'Represents the CPU slowdown factor. Set the rate to 1 to disable throttling. If omitted, throttling remains unchanged.',
        minimum: 1,
        maximum: 20
      },
      geolocation: {
        type: 'object',
        description: 'Geolocation to emulate. Set to null to clear the geolocation override.',
        properties: {
          latitude: {
            type: 'number',
            description: 'Latitude between -90 and 90.',
            minimum: -90,
            maximum: 90
          },
          longitude: {
            type: 'number',
            description: 'Longitude between -180 and 180.',
            minimum: -180,
            maximum: 180
          }
        },
        required: ['latitude', 'longitude'],
        // @ts-ignore
        nullable: true
      }
    }
  },
  execute: async (params, context): Promise<ToolResult> => {
    // We need to cast context to any to access CDP functionality
    // This assumes the context implementation provides sendCDPCommand
    const ctx = context as any

    if (!ctx.viewId && !ctx.getActiveViewId?.()) {
      return {
        success: false,
        error: 'No active browser page.'
      }
    }

    const results: string[] = []

    try {
      // Network conditions
      const networkConditions = params.networkConditions as string | undefined
      if (networkConditions !== undefined) {
        if (networkConditions === 'No emulation') {
          await ctx.sendCDPCommand?.('Network.emulateNetworkConditions', {
            offline: false,
            latency: 0,
            downloadThroughput: -1,
            uploadThroughput: -1
          })
          results.push('Network: No emulation')
        } else if (networkConditions === 'Offline') {
          await ctx.sendCDPCommand?.('Network.emulateNetworkConditions', {
            offline: true,
            latency: 0,
            downloadThroughput: 0,
            uploadThroughput: 0
          })
          results.push('Network: Offline')
        } else if (networkConditions in NETWORK_CONDITIONS) {
          const condition = NETWORK_CONDITIONS[networkConditions as keyof typeof NETWORK_CONDITIONS]
          await ctx.sendCDPCommand?.('Network.emulateNetworkConditions', {
            offline: false,
            latency: condition.latency,
            downloadThroughput: condition.download,
            uploadThroughput: condition.upload
          })
          results.push(`Network: ${networkConditions}`)
        }
      }

      // CPU throttling
      if (params.cpuThrottlingRate !== undefined) {
        const rate = params.cpuThrottlingRate as number
        await ctx.sendCDPCommand?.('Emulation.setCPUThrottlingRate', { rate })
        results.push(`CPU throttling: ${rate}x`)
      }

      // Geolocation
      if (params.geolocation !== undefined) {
        const geo = params.geolocation as { latitude: number; longitude: number } | null
        if (geo === null) {
          await ctx.sendCDPCommand?.('Emulation.clearGeolocationOverride')
          results.push('Geolocation: cleared')
        } else {
          await ctx.sendCDPCommand?.('Emulation.setGeolocationOverride', {
            latitude: geo.latitude,
            longitude: geo.longitude,
            accuracy: 100
          })
          results.push(`Geolocation: ${geo.latitude}, ${geo.longitude}`)
        }
      }

      if (results.length === 0) {
        return {
          success: true,
          data: { message: 'No emulation settings changed.' }
        }
      }

      return {
        success: true,
        data: {
          output: results.join('\n')
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Emulation failed: ${(error as Error).message}`
      }
    }
  }
}

/**
 * resize_page - Resize the browser viewport
 * Aligned with chrome-devtools-mcp: resize_page (in pages.ts)
 */
export const resizePageTool: BrowserTool = {
  name: 'browser_resize',
  description: "Resizes the selected page's window so that the page has specified dimension",
  parameters: {
    type: 'object',
    properties: {
      width: {
        type: 'number',
        description: 'Page width'
      },
      height: {
        type: 'number',
        description: 'Page height'
      }
    },
    required: ['width', 'height']
  },
  execute: async (params, context): Promise<ToolResult> => {
    const width = params.width as number
    const height = params.height as number
    const ctx = context as any

    if (!ctx.viewId && !ctx.getActiveViewId?.()) {
      return {
        success: false,
        error: 'No active browser page.'
      }
    }

    try {
      await ctx.sendCDPCommand?.('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
        screenWidth: width,
        screenHeight: height
      })

      return {
        success: true,
        data: {
          message: `Viewport resized to: ${width}x${height}`
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Resize failed: ${(error as Error).message}`
      }
    }
  }
}

// Export all emulation tools
export const emulationTools: BrowserTool[] = [emulateTool, resizePageTool]
