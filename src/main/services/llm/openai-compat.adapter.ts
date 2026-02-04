import { OpenAIAdapter } from './openai.adapter'

/**
 * Normalizes a base URL for OpenAI-compatible API endpoints.
 *
 * Handles common misconfiguration issues:
 * - Removes trailing slashes to prevent double-slash issues
 * - Ensures the URL ends with /v1 (or similar version path) for standard OpenAI-compatible APIs
 *
 * @example
 * normalizeBaseURL('http://localhost:3000/') -> 'http://localhost:3000/v1'
 * normalizeBaseURL('http://localhost:3000/v1/') -> 'http://localhost:3000/v1'
 * normalizeBaseURL('http://localhost:3000/api/v1') -> 'http://localhost:3000/api/v1'
 */
function normalizeBaseURL(baseURL: string): string {
  // Remove trailing slashes
  let normalized = baseURL.replace(/\/+$/, '')

  // Check if URL already ends with a version path (v1, v2, etc.)
  if (!/\/v\d+$/.test(normalized)) {
    // URL doesn't end with version path, append /v1
    normalized = `${normalized}/v1`
  }

  return normalized
}

export class OpenAICompatAdapter extends OpenAIAdapter {
  constructor(apiKey: string, baseURL: string) {
    if (!baseURL) {
      throw new Error('baseURL is required for OpenAI-compatible adapter')
    }
    const normalizedURL = normalizeBaseURL(baseURL)
    super(apiKey, normalizedURL)
  }
}
