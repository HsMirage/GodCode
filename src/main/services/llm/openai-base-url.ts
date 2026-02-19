const OPENAI_ENDPOINT_SUFFIXES = [
  '/chat/completions',
  '/responses',
  '/embeddings',
  '/images/generations'
]

function stripKnownEndpointSuffix(pathname: string): string {
  const lower = pathname.toLowerCase()
  for (const suffix of OPENAI_ENDPOINT_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      return pathname.slice(0, pathname.length - suffix.length)
    }
  }
  return pathname
}

/**
 * Normalize OpenAI-compatible base URLs with conservative rules:
 * - Keep custom path prefixes as-is (do not force append /v1 for non-root paths)
 * - Append /v1 only when user provides a pure host/root URL
 * - If user mistakenly enters a full endpoint (e.g. .../chat/completions), strip endpoint suffix
 */
export function normalizeOpenAICompatibleBaseURL(baseURL: string): string {
  const trimmed = baseURL.trim()
  if (!trimmed) return trimmed

  try {
    const url = new URL(trimmed)
    let pathname = stripKnownEndpointSuffix(url.pathname)
    pathname = pathname.replace(/\/+$/, '')

    // Only default to /v1 for root URLs. Preserve custom path prefixes.
    if (!pathname || pathname === '/') {
      pathname = '/v1'
    }

    url.pathname = pathname
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    // Fallback for non-standard URLs
    let normalized = stripKnownEndpointSuffix(trimmed).replace(/\/+$/, '')
    if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(normalized) && normalized && !normalized.startsWith('/')) {
      normalized = `https://${normalized}`
    }
    return normalized
  }
}

