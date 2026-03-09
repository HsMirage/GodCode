import type { LLMConfigApiProtocol } from './adapter.interface'

const OPENAI_PROTOCOL_PROVIDERS = new Set([
  'openai',
  'openai-compatible',
  'openai-compat',
  'custom',
  'azure-openai',
  'azure'
])

const RESPONSES_FIRST_PROVIDERS = new Set(['openai'])

export function normalizeOpenAIProtocol(value: unknown): LLMConfigApiProtocol | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  if (normalized === 'chat/completions' || normalized === 'responses') {
    return normalized
  }

  return undefined
}

export function isOpenAIProtocolProvider(provider: string): boolean {
  return OPENAI_PROTOCOL_PROVIDERS.has(provider.trim().toLowerCase())
}

export function inferPreferredOpenAIProtocol(provider: string): LLMConfigApiProtocol | undefined {
  const normalizedProvider = provider.trim().toLowerCase()
  if (!OPENAI_PROTOCOL_PROVIDERS.has(normalizedProvider)) {
    return undefined
  }

  if (RESPONSES_FIRST_PROVIDERS.has(normalizedProvider)) {
    return 'responses'
  }

  return 'chat/completions'
}

export function getAlternateOpenAIProtocol(
  protocol: LLMConfigApiProtocol
): LLMConfigApiProtocol {
  return protocol === 'responses' ? 'chat/completions' : 'responses'
}

export function buildOpenAIProtocolCandidates(input: {
  configured?: unknown
  preferred?: LLMConfigApiProtocol
}): LLMConfigApiProtocol[] {
  const configured = normalizeOpenAIProtocol(input.configured)
  const preferred = input.preferred ?? 'responses'
  const first = configured ?? preferred
  const second = getAlternateOpenAIProtocol(first)
  return [first, second]
}

export function shouldRetryWithAlternateOpenAIProtocol(input: {
  error: unknown
  attempted: LLMConfigApiProtocol
}): boolean {
  const message = input.error instanceof Error ? input.error.message.toLowerCase() : String(input.error || '').toLowerCase()
  if (!message) {
    return false
  }

  if (
    message.includes('cancelled by user') ||
    message.includes('canceled by user') ||
    message.includes('request aborted by user')
  ) {
    return false
  }

  if (
    /\b404\b|\b405\b|\b501\b/.test(message) ||
    message.includes('not found') ||
    message.includes('method not allowed') ||
    message.includes('unsupported endpoint') ||
    message.includes('unknown endpoint') ||
    message.includes('does not support') ||
    message.includes('route not found') ||
    message.includes('no route matched')
  ) {
    return true
  }

  if (input.attempted === 'responses') {
    return (
      message.includes('/responses') ||
      message.includes('responses api') ||
      message.includes('response api') ||
      message.includes('max_output_tokens') ||
      message.includes('input_text') ||
      message.includes('function_call_output')
    )
  }

  return (
    message.includes('/chat/completions') ||
    message.includes('chat/completions api') ||
    message.includes('chat completions api') ||
    message.includes('expected input') ||
    message.includes('unknown parameter: messages')
  )
}
