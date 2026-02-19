import fs from 'fs/promises'
import path from 'path'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions'
import type { ContentBlockParam, MessageParam as AnthropicMessageParam } from '@anthropic-ai/sdk/resources/messages/messages'
import { LoggerService } from '@/main/services/logger'
import { BindingService } from '@/main/services/binding.service'
import { normalizeOpenAICompatibleBaseURL } from './openai-base-url'

const MULTIMODAL_LOOKER_AGENT_CODE = 'multimodal-looker'
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const MAX_MEDIA_SIZE_BYTES = 20 * 1024 * 1024
const DEFAULT_MAX_OUTPUT_TOKENS = 1200

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif'
])

type AnthropicImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

interface MultimodalMediaInput {
  goal: string
  filePath?: string
  imageData?: string
  workspaceDir: string
}

interface PreparedMedia {
  mimeType: string
  base64Data: string
  filename: string
}

export interface MultimodalLookerResult {
  content: string
  provider: string
  model: string
}

function isWithinWorkspace(resolvedPath: string, workspaceDir: string): boolean {
  const workspace = path.resolve(workspaceDir)
  const target = path.resolve(resolvedPath)
  const normalize = (value: string): string =>
    process.platform === 'win32' ? value.toLowerCase() : value
  const normalizedWorkspace = normalize(workspace)
  const normalizedTarget = normalize(target)
  return (
    normalizedTarget === normalizedWorkspace ||
    normalizedTarget.startsWith(normalizedWorkspace + path.sep)
  )
}

function normalizeBase64Data(input: string): { mimeType: string; base64Data: string } {
  const trimmed = input.trim()
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/s)
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1],
      base64Data: dataUrlMatch[2].replace(/\s+/g, '')
    }
  }

  return {
    mimeType: 'image/png',
    base64Data: trimmed.replace(/\s+/g, '')
  }
}

function inferMimeTypeFromFilePath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.pdf': 'application/pdf'
  }
  return map[ext] || 'application/octet-stream'
}

function extensionFromMimeType(mimeType: string): string {
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'application/pdf': 'pdf'
  }
  return extMap[mimeType] || 'bin'
}

function isImageMimeType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)
}

function buildExtractionPrompt(goal: string): string {
  return [
    'Analyze the attached media and extract exactly what is requested.',
    '',
    `Goal: ${goal}`,
    '',
    'Rules:',
    '- Return ONLY the extracted content relevant to the goal.',
    '- Do not add preamble, markdown wrappers, or meta commentary.',
    '- If requested information is missing, state clearly what is missing.',
    '- Keep answer concise while preserving critical details.'
  ].join('\n')
}

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase()
}

export class MultimodalLookerService {
  private static instance: MultimodalLookerService
  private readonly logger = LoggerService.getInstance().getLogger()
  private readonly bindingService = BindingService.getInstance()

  static getInstance(): MultimodalLookerService {
    if (!MultimodalLookerService.instance) {
      MultimodalLookerService.instance = new MultimodalLookerService()
    }
    return MultimodalLookerService.instance
  }

  async extract(input: MultimodalMediaInput): Promise<MultimodalLookerResult> {
    const goal = input.goal.trim()
    if (!goal) {
      throw new Error("Missing required parameter 'goal'")
    }

    const hasFilePath = Boolean(input.filePath?.trim())
    const hasImageData = Boolean(input.imageData?.trim())

    if (!hasFilePath && !hasImageData) {
      throw new Error("Must provide either 'file_path' or 'image_data'")
    }

    if (hasFilePath && hasImageData) {
      throw new Error("Provide only one of 'file_path' or 'image_data'")
    }

    const modelConfig = await this.bindingService.getAgentModelConfig(MULTIMODAL_LOOKER_AGENT_CODE)
    if (!modelConfig) {
      throw new Error(
        `Agent「${MULTIMODAL_LOOKER_AGENT_CODE}」未配置可用模型。请到“设置 -> Agent 绑定”中启用并绑定模型。`
      )
    }

    const media = hasFilePath
      ? await this.prepareFileMedia(input.filePath as string, input.workspaceDir)
      : this.prepareInlineMedia(input.imageData as string)

    const provider = normalizeProvider(modelConfig.provider)
    const prompt = buildExtractionPrompt(goal)

    this.logger.info('[look_at] invoking multimodal-looker', {
      provider,
      model: modelConfig.model,
      mimeType: media.mimeType
    })

    if (provider === 'anthropic' || provider === 'claude') {
      const content = await this.extractWithAnthropic(
        modelConfig.model,
        modelConfig.apiKey || '',
        modelConfig.baseURL,
        modelConfig.temperature,
        prompt,
        media
      )
      return { content, provider, model: modelConfig.model }
    }

    if (provider === 'gemini' || provider === 'google' || provider === 'google-gemini') {
      const content = await this.extractWithGemini(
        modelConfig.model,
        modelConfig.apiKey || '',
        modelConfig.baseURL,
        modelConfig.temperature,
        prompt,
        media
      )
      return { content, provider, model: modelConfig.model }
    }

    if (
      provider === 'openai' ||
      provider === 'openai-compatible' ||
      provider === 'openai-compat' ||
      provider === 'custom' ||
      provider === 'azure-openai' ||
      provider === 'azure'
    ) {
      const content = await this.extractWithOpenAICompatible(
        provider,
        modelConfig.model,
        modelConfig.apiKey || '',
        modelConfig.baseURL,
        modelConfig.temperature,
        prompt,
        media
      )
      return { content, provider, model: modelConfig.model }
    }

    throw new Error(`Unsupported provider for look_at: ${modelConfig.provider}`)
  }

  private async prepareFileMedia(filePath: string, workspaceDir: string): Promise<PreparedMedia> {
    const resolvedPath = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.resolve(workspaceDir, filePath)

    if (!isWithinWorkspace(resolvedPath, workspaceDir)) {
      throw new Error('Access denied: file_path must be inside workspace')
    }

    const stat = await fs.stat(resolvedPath)
    if (!stat.isFile()) {
      throw new Error('file_path must point to a file')
    }

    if (stat.size > MAX_MEDIA_SIZE_BYTES) {
      throw new Error(
        `File too large (${stat.size} bytes). Max supported size is ${MAX_MEDIA_SIZE_BYTES} bytes.`
      )
    }

    const buffer = await fs.readFile(resolvedPath)
    const mimeType = inferMimeTypeFromFilePath(resolvedPath)

    return {
      mimeType,
      base64Data: buffer.toString('base64'),
      filename: path.basename(resolvedPath)
    }
  }

  private prepareInlineMedia(imageData: string): PreparedMedia {
    const normalized = normalizeBase64Data(imageData)
    if (!normalized.base64Data) {
      throw new Error("image_data cannot be empty")
    }

    return {
      mimeType: normalized.mimeType,
      base64Data: normalized.base64Data,
      filename: `clipboard.${extensionFromMimeType(normalized.mimeType)}`
    }
  }

  private async extractWithOpenAICompatible(
    provider: string,
    model: string,
    apiKey: string,
    baseURL: string | undefined,
    temperature: number,
    prompt: string,
    media: PreparedMedia
  ): Promise<string> {
    if (!isImageMimeType(media.mimeType)) {
      throw new Error(
        `Provider "${provider}" currently supports image inputs only in look_at. Please use a Gemini or Anthropic model for PDF files.`
      )
    }

    if (!apiKey) {
      throw new Error(`Missing API Key for provider "${provider}"`)
    }

    const normalizedBaseURL =
      provider === 'openai-compatible' || provider === 'openai-compat' || provider === 'custom'
        ? baseURL
          ? normalizeOpenAICompatibleBaseURL(baseURL)
          : undefined
        : baseURL

    const client = new OpenAI({
      apiKey,
      ...(normalizedBaseURL ? { baseURL: normalizedBaseURL } : {})
    })

    const userContent: ChatCompletionContentPart[] = [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: {
          url: `data:${media.mimeType};base64,${media.base64Data}`
        }
      }
    ]

    const response = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: 'system',
          content:
            'You are a multimodal extraction assistant. Return only the extracted content relevant to the goal.'
        },
        {
          role: 'user',
          content: userContent
        }
      ]
    })

    const rawContent = response.choices[0]?.message?.content as unknown
    if (!rawContent) {
      throw new Error('No response content from model')
    }

    if (typeof rawContent === 'string') {
      return rawContent.trim()
    }

    if (Array.isArray(rawContent)) {
      const text = rawContent
        .map((part: unknown) =>
          typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''
        )
        .join('')
        .trim()
      if (!text) {
        throw new Error('No response content from model')
      }
      return text
    }

    throw new Error('Unsupported response content format from model')
  }

  private async extractWithAnthropic(
    model: string,
    apiKey: string,
    baseURL: string | undefined,
    temperature: number,
    prompt: string,
    media: PreparedMedia
  ): Promise<string> {
    if (!apiKey) {
      throw new Error('Missing API Key for provider "anthropic"')
    }

    const mediaBlock = isImageMimeType(media.mimeType)
      ? ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: media.mimeType as AnthropicImageMimeType,
            data: media.base64Data
          }
        } as const)
      : media.mimeType === 'application/pdf'
        ? ({
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: media.base64Data
            }
          } as const)
        : null

    if (!mediaBlock) {
      throw new Error(`Unsupported media type for Anthropic look_at: ${media.mimeType}`)
    }

    const client = new Anthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {})
    })

    const userContent: ContentBlockParam[] = [{ type: 'text', text: prompt }, mediaBlock]
    const messages: AnthropicMessageParam[] = [{ role: 'user', content: userContent }]

    const response = await client.messages.create({
      model,
      max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
      temperature,
      system:
        'You are a multimodal extraction assistant. Return only the extracted content relevant to the goal.',
      messages
    })

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim()

    if (!text) {
      throw new Error('No response content from model')
    }

    return text
  }

  private async extractWithGemini(
    model: string,
    apiKey: string,
    baseURL: string | undefined,
    temperature: number,
    prompt: string,
    media: PreparedMedia
  ): Promise<string> {
    if (!apiKey) {
      throw new Error('Missing API Key for provider "gemini"')
    }

    const endpointBase = (baseURL || GEMINI_API_BASE).replace(/\/+$/, '')
    const endpoint = `${endpointBase}/models/${model}:generateContent?key=${apiKey}`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: media.mimeType,
                  data: media.base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>
        }
      }>
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim()

    if (!text) {
      throw new Error('No response content from model')
    }

    return text
  }
}

export const multimodalLookerService = MultimodalLookerService.getInstance()
