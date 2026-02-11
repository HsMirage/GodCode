import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source?: string
}

export interface WebSearchResponse {
  results: WebSearchResult[]
  totalResults: number
  query: string
  engine: string
}

/**
 * DuckDuckGo HTML search (no API key required)
 * Uses the HTML page since DuckDuckGo's instant answer API has limitations
 */
async function searchDuckDuckGo(
  query: string,
  maxResults: number,
  allowedDomains?: string[],
  blockedDomains?: string[]
): Promise<WebSearchResponse> {
  // Use DuckDuckGo HTML search
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    }
  })

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const results: WebSearchResult[] = []

  // Parse search results from HTML
  // DuckDuckGo HTML format: <a class="result__a" href="...">title</a>
  // <a class="result__snippet">snippet</a>
  const resultRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)/gi
  let match

  while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
    let url = match[1]
    const title = decodeHTMLEntities(match[2].trim())
    const snippet = decodeHTMLEntities(match[3].trim())

    // DuckDuckGo wraps URLs in their redirect
    if (url.includes('uddg=')) {
      const uddgMatch = url.match(/uddg=([^&]+)/)
      if (uddgMatch) {
        url = decodeURIComponent(uddgMatch[1])
      }
    }

    // Apply domain filtering
    if (allowedDomains && allowedDomains.length > 0) {
      const urlHost = getHostFromUrl(url)
      if (!allowedDomains.some(domain => urlHost.includes(domain))) {
        continue
      }
    }

    if (blockedDomains && blockedDomains.length > 0) {
      const urlHost = getHostFromUrl(url)
      if (blockedDomains.some(domain => urlHost.includes(domain))) {
        continue
      }
    }

    if (url && title) {
      results.push({
        title,
        url,
        snippet,
        source: getHostFromUrl(url)
      })
    }
  }

  // Fallback: try alternate parsing pattern
  if (results.length === 0) {
    const altRegex =
      /<div[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<[^>]*class="[^"]*snippet[^"]*"[^>]*>([^<]*)/gi

    while ((match = altRegex.exec(html)) !== null && results.length < maxResults) {
      let url = match[1]
      const title = decodeHTMLEntities(match[2].trim())
      const snippet = decodeHTMLEntities(match[3].trim())

      if (url.includes('uddg=')) {
        const uddgMatch = url.match(/uddg=([^&]+)/)
        if (uddgMatch) {
          url = decodeURIComponent(uddgMatch[1])
        }
      }

      // Apply domain filtering
      if (allowedDomains && allowedDomains.length > 0) {
        const urlHost = getHostFromUrl(url)
        if (!allowedDomains.some(domain => urlHost.includes(domain))) {
          continue
        }
      }

      if (blockedDomains && blockedDomains.length > 0) {
        const urlHost = getHostFromUrl(url)
        if (blockedDomains.some(domain => urlHost.includes(domain))) {
          continue
        }
      }

      if (url && title) {
        results.push({
          title,
          url,
          snippet,
          source: getHostFromUrl(url)
        })
      }
    }
  }

  return {
    results,
    totalResults: results.length,
    query,
    engine: 'duckduckgo'
  }
}

/**
 * Helper to decode HTML entities
 */
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '='
  }

  return text.replace(/&[^;]+;/g, match => entities[match] || match)
}

/**
 * Extract hostname from URL
 */
function getHostFromUrl(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * Format search results for output
 */
function formatResults(response: WebSearchResponse): string {
  if (response.results.length === 0) {
    return `No results found for query: "${response.query}"`
  }

  const lines: string[] = [
    `Search results for: "${response.query}"`,
    `Found ${response.totalResults} results (via ${response.engine})`,
    ''
  ]

  response.results.forEach((result, index) => {
    lines.push(`${index + 1}. ${result.title}`)
    lines.push(`   URL: ${result.url}`)
    if (result.snippet) {
      lines.push(`   ${result.snippet}`)
    }
    lines.push('')
  })

  return lines.join('\n')
}

export const websearchTool: Tool = {
  definition: {
    name: 'websearch',
    description:
      'Search the web using DuckDuckGo. Returns a list of search results with titles, URLs, and snippets. Useful for finding up-to-date information, documentation, and resources.',
    category: 'search',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'The search query to execute',
        required: true
      },
      {
        name: 'max_results',
        type: 'number',
        description: 'Maximum number of results to return (default: 10, max: 20)',
        required: false,
        default: 10
      },
      {
        name: 'allowed_domains',
        type: 'array',
        description:
          'Optional list of domains to restrict results to (e.g., ["github.com", "stackoverflow.com"])',
        required: false
      },
      {
        name: 'blocked_domains',
        type: 'array',
        description: 'Optional list of domains to exclude from results',
        required: false
      }
    ]
  },

  async execute(
    params: Record<string, any>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    try {
      const query = params.query as string
      if (!query || query.trim() === '') {
        return {
          success: false,
          output: '',
          error: 'Search query is required'
        }
      }

      const maxResults = Math.min(Math.max(params.max_results || 10, 1), 20)
      const allowedDomains = params.allowed_domains as string[] | undefined
      const blockedDomains = params.blocked_domains as string[] | undefined

      const response = await searchDuckDuckGo(query, maxResults, allowedDomains, blockedDomains)

      return {
        success: true,
        output: formatResults(response),
        metadata: {
          query: response.query,
          engine: response.engine,
          totalResults: response.totalResults,
          results: response.results
        }
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
