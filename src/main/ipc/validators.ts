import { z } from 'zod'

export const spaceCreateSchema = z.object({
  name: z.string().min(1).max(100),
  workDir: z.string().min(1)
})

export const spaceUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  workDir: z.string().min(1).optional()
})

export const sessionCreateSchema = z.object({
  spaceId: z.string().uuid(),
  title: z.string().min(1).max(200).optional()
})

export const sessionGetOrCreateDefaultSchema = z.object({
  spaceId: z.string().uuid().optional()
})

export const modelCreateSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'gemini', 'openai-compatible', 'azure-openai', 'mock']),
  modelName: z.string().min(1),
  apiKey: z.string().optional(),
  apiKeyId: z.string().uuid().optional(),
  baseURL: z.string().url().optional().nullable(),
  contextSize: z.number().int().min(1).max(2000).optional(),
  config: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().min(1).max(200000).optional(),
      timeout: z.number().int().min(1000).max(10 * 60 * 1000).optional(),
      timeoutMs: z.number().int().min(1000).max(10 * 60 * 1000).optional(),
      maxRetries: z.number().int().min(0).max(10).optional(),
      baseDelayMs: z.number().int().min(0).max(60000).optional(),
      maxToolIterations: z.number().int().min(1).max(50).optional(),
      defaultMaxTokens: z.number().int().min(1).max(200000).optional(),
      thinkingMode: z.boolean().optional()
    })
    .passthrough()
    .optional()
})

export const modelUpdateSchema = z.object({
  id: z.string().uuid(),
  data: z.object({
    provider: z
      .enum(['openai', 'anthropic', 'gemini', 'openai-compatible', 'azure-openai', 'mock'])
      .optional(),
    modelName: z.string().min(1).optional(),
    apiKey: z.string().optional(),
    apiKeyId: z.string().uuid().optional().nullable(),
    baseURL: z.string().url().optional().nullable(),
    contextSize: z.number().int().min(1).max(2000).optional(),
    config: z
      .object({
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().min(1).max(200000).optional(),
        timeout: z.number().int().min(1000).max(10 * 60 * 1000).optional(),
        timeoutMs: z.number().int().min(1000).max(10 * 60 * 1000).optional(),
        maxRetries: z.number().int().min(0).max(10).optional(),
        baseDelayMs: z.number().int().min(0).max(60000).optional(),
        maxToolIterations: z.number().int().min(1).max(50).optional(),
        defaultMaxTokens: z.number().int().min(1).max(200000).optional(),
        thinkingMode: z.boolean().optional()
      })
      .passthrough()
      .optional()
  })
})

export const browserCreateSchema = z.object({
  viewId: z.string().min(1),
  url: z.string().url().optional()
})

export const browserNavigateSchema = z.object({
  viewId: z.string().min(1),
  url: z.string().url()
})

export const browserViewBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
})

export const browserResizeSchema = z.object({
  viewId: z.string().min(1),
  bounds: browserViewBoundsSchema
})

export const browserShowSchema = z.object({
  viewId: z.string().min(1),
  bounds: browserViewBoundsSchema
})

export const browserCommonSchema = z.object({
  viewId: z.string().min(1)
})

export const browserExecuteJsSchema = z.object({
  viewId: z.string().min(1),
  code: z.string().min(1)
})

export const browserZoomSchema = z.object({
  viewId: z.string().min(1),
  level: z.number().min(0.1).max(5)
})

export const browserContextMenuSchema = z.object({
  viewId: z.string().min(1),
  zoomLevel: z.number()
})
