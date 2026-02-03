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
  provider: z.enum([
    'anthropic',
    'openai',
    'gemini',
    'google',
    'ollama',
    'custom',
    'openai-compatible'
  ]),
  modelName: z.string().min(1),
  apiKey: z.string().optional(),
  baseURL: z.string().url().optional().nullable(),
  config: z.record(z.unknown()).optional()
})

export const modelUpdateSchema = z.object({
  id: z.string().uuid(),
  data: z.object({
    provider: z
      .enum(['anthropic', 'openai', 'gemini', 'google', 'ollama', 'custom', 'openai-compatible'])
      .optional(),
    modelName: z.string().min(1).optional(),
    apiKey: z.string().optional(),
    baseURL: z.string().url().optional().nullable(),
    config: z.record(z.unknown()).optional()
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
