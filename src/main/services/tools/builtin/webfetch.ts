import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'

// Default configuration
const DEFAULT_TIMEOUT = 30000 // 30 seconds
const DEFAULT_MAX_CONTENT_SIZE = 500000 // 500KB
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Simple HTML to Markdown converter
 * Handles common HTML elements without external dependencies
 */
function htmlToMarkdown(html: string): string {
  let text = html

  // Remove scripts and styles
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')

  // Handle headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
  text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
  text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')

  // Handle paragraphs and divs
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
  text = text.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '\n$1\n')

  // Handle line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<hr\s*\/?>/gi, '\n---\n')

  // Handle lists
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '\n$1\n')
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '\n$1\n')
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')

  // Handle links
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')

  // Handle images
  text = text.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)')
  text = text.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
  text = text.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)')

  // Handle text formatting
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
  text = text.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n')

  // Handle blockquotes
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    return (
      '\n' +
      content
        .split('\n')
        .map((line: string) => `> ${line}`)
        .join('\n') +
      '\n'
    )
  })

  // Handle tables (basic support)
  text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, '\n$1\n')
  text = text.replace(/<thead[^>]*>([\s\S]*?)<\/thead>/gi, '$1')
  text = text.replace(/<tbody[^>]*>([\s\S]*?)<\/tbody>/gi, '$1')
  text = text.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, '$1|\n')
  text = text.replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, '| $1 ')
  text = text.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, '| $1 ')

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode HTML entities
  text = decodeHtmlEntities(text)

  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n') // Multiple newlines to double
  text = text.replace(/[ \t]+/g, ' ') // Multiple spaces to single
  text = text.replace(/^\s+|\s+$/gm, '') // Trim each line
  text = text.trim()

  return text
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&bull;': '•',
    '&middot;': '·'
  }

  let result = text
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'g'), char)
  }

  // Handle numeric entities
  result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  )

  return result
}

/**
 * Extract page title from HTML
 */
function extractTitle(html: string): string | undefined {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch) {
    return decodeHtmlEntities(titleMatch[1].trim())
  }
  return undefined
}

/**
 * Extract meta description from HTML
 */
function extractDescription(html: string): string | undefined {
  const descMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*\/?>/i
  )
  if (descMatch) {
    return decodeHtmlEntities(descMatch[1].trim())
  }
  // Try alternative format
  const altMatch = html.match(
    /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*\/?>/i
  )
  if (altMatch) {
    return decodeHtmlEntities(altMatch[1].trim())
  }
  return undefined
}

/**
 * Extract main content from HTML (attempts to find article/main content)
 */
function extractMainContent(html: string): string {
  // Try to extract from common content containers
  const contentPatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
    /<main[^>]*>([\s\S]*?)<\/main>/gi,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  ]

  for (const pattern of contentPatterns) {
    const match = pattern.exec(html)
    if (match && match[1] && match[1].length > 200) {
      return match[1]
    }
  }

  // Fall back to body content
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  if (bodyMatch) {
    return bodyMatch[1]
  }

  return html
}

/**
 * Fetch a URL with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number }
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

export const webFetchTool: Tool = {
  definition: {
    name: 'webfetch',
    description:
      'Fetch content from a web URL and convert it to readable Markdown. Supports HTTP/HTTPS URLs with timeout control and content size limits.',
    category: 'browser',
    parameters: [
      {
        name: 'url',
        type: 'string',
        description: 'The URL to fetch (must be HTTP or HTTPS)',
        required: true
      },
      {
        name: 'timeout',
        type: 'number',
        description: `Timeout in milliseconds (default: ${DEFAULT_TIMEOUT})`,
        required: false,
        default: DEFAULT_TIMEOUT
      },
      {
        name: 'max_size',
        type: 'number',
        description: `Maximum content size in bytes (default: ${DEFAULT_MAX_CONTENT_SIZE})`,
        required: false,
        default: DEFAULT_MAX_CONTENT_SIZE
      },
      {
        name: 'user_agent',
        type: 'string',
        description: 'Custom User-Agent header',
        required: false,
        default: DEFAULT_USER_AGENT
      },
      {
        name: 'extract_main',
        type: 'boolean',
        description: 'Attempt to extract only the main content (default: true)',
        required: false,
        default: true
      },
      {
        name: 'include_metadata',
        type: 'boolean',
        description: 'Include page title and description in output (default: true)',
        required: false,
        default: true
      }
    ]
  },

  async execute(
    params: Record<string, any>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const {
      url,
      timeout = DEFAULT_TIMEOUT,
      max_size = DEFAULT_MAX_CONTENT_SIZE,
      user_agent = DEFAULT_USER_AGENT,
      extract_main = true,
      include_metadata = true
    } = params

    // Validate URL
    if (!url || typeof url !== 'string') {
      return {
        success: false,
        output: '',
        error: 'URL is required'
      }
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return {
        success: false,
        output: '',
        error: 'Invalid URL format'
      }
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        success: false,
        output: '',
        error: 'Only HTTP and HTTPS URLs are supported'
      }
    }

    try {
      // Fetch the URL
      const response = await fetchWithTimeout(url, {
        timeout,
        headers: {
          'User-Agent': user_agent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7'
        }
      })

      if (!response.ok) {
        return {
          success: false,
          output: '',
          error: `HTTP error: ${response.status} ${response.statusText}`
        }
      }

      // Check content type
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        // For non-HTML content, return as-is (truncated if needed)
        const text = await response.text()
        const truncated = text.slice(0, max_size)
        return {
          success: true,
          output: truncated,
          metadata: {
            url,
            contentType,
            size: text.length,
            truncated: text.length > max_size
          }
        }
      }

      // Get HTML content
      let html = await response.text()

      // Truncate if too large
      const wasTruncated = html.length > max_size
      if (wasTruncated) {
        html = html.slice(0, max_size)
      }

      // Extract metadata
      const title = extractTitle(html)
      const description = extractDescription(html)

      // Extract main content if requested
      const content = extract_main ? extractMainContent(html) : html

      // Convert to Markdown
      let markdown = htmlToMarkdown(content)

      // Add metadata header if requested
      if (include_metadata) {
        const header: string[] = []
        if (title) {
          header.push(`# ${title}`)
        }
        header.push(`> Source: ${url}`)
        if (description) {
          header.push(`> ${description}`)
        }
        if (wasTruncated) {
          header.push(`> *Content truncated due to size limit*`)
        }
        header.push('')

        markdown = header.join('\n') + '\n' + markdown
      }

      return {
        success: true,
        output: markdown,
        metadata: {
          url,
          title,
          description,
          contentType,
          originalSize: html.length,
          truncated: wasTruncated
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            output: '',
            error: `Request timeout after ${timeout}ms`
          }
        }
        return {
          success: false,
          output: '',
          error: error.message
        }
      }
      return {
        success: false,
        output: '',
        error: String(error)
      }
    }
  }
}
