import { useMemo } from 'react'
import { cn } from '../../utils'

interface MarkdownRendererProps {
  content: string
  className?: string
  isStreaming?: boolean
}

/**
 * Simple Markdown renderer for chat messages
 * Supports: code blocks, inline code, bold, italic, headers, lists, links
 */
export function MarkdownRenderer({ content, className, isStreaming }: MarkdownRendererProps) {
  const rendered = useMemo(() => {
    if (!content) return null
    return parseMarkdown(content)
  }, [content])

  return (
    <div className={cn('markdown-content', className)}>
      {rendered}
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-emerald-500 animate-pulse align-middle" />
      )}
    </div>
  )
}

/**
 * Parse markdown content into React elements
 */
function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let inCodeBlock = false
  let codeBlockContent: string[] = []
  let codeBlockLang = ''
  let key = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code block start/end
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeBlockLang = line.slice(3).trim()
        codeBlockContent = []
      } else {
        elements.push(
          <CodeBlock key={key++} language={codeBlockLang} code={codeBlockContent.join('\n')} />
        )
        inCodeBlock = false
        codeBlockLang = ''
        codeBlockContent = []
      }
      continue
    }

    if (inCodeBlock) {
      codeBlockContent.push(line)
      continue
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={key++} className="text-base font-semibold mt-4 mb-2 text-[var(--text-primary)]">
          {parseInline(line.slice(4))}
        </h3>
      )
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={key++} className="text-lg font-semibold mt-4 mb-2 text-[var(--text-primary)]">
          {parseInline(line.slice(3))}
        </h2>
      )
      continue
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={key++} className="text-xl font-bold mt-4 mb-2 text-[var(--text-primary)]">
          {parseInline(line.slice(2))}
        </h1>
      )
      continue
    }

    // Unordered list
    if (line.match(/^[-*]\s/)) {
      elements.push(
        <li key={key++} className="ml-4 list-disc list-inside">
          {parseInline(line.slice(2))}
        </li>
      )
      continue
    }

    // Ordered list
    const orderedMatch = line.match(/^(\d+)\.\s/)
    if (orderedMatch) {
      elements.push(
        <li key={key++} className="ml-4 list-decimal list-inside">
          {parseInline(line.slice(orderedMatch[0].length))}
        </li>
      )
      continue
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<br key={key++} />)
      continue
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="my-1">
        {parseInline(line)}
      </p>
    )
  }

  // Handle unclosed code block (streaming)
  if (inCodeBlock && codeBlockContent.length > 0) {
    elements.push(
      <CodeBlock key={key++} language={codeBlockLang} code={codeBlockContent.join('\n')} isStreaming />
    )
  }

  return elements
}

/**
 * Parse inline markdown elements (bold, italic, code, links)
 */
function parseInline(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      elements.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-mono text-[0.9em]"
        >
          {codeMatch[1]}
        </code>
      )
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/)
    if (boldMatch) {
      elements.push(
        <strong key={key++} className="font-semibold">
          {boldMatch[1]}
        </strong>
      )
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // Italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/)
    if (italicMatch) {
      elements.push(<em key={key++}>{italicMatch[1]}</em>)
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      elements.push(
        <a
          key={key++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-500 hover:underline"
        >
          {linkMatch[1]}
        </a>
      )
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }

    // Find next special character
    const nextSpecial = remaining.search(/[`*[]/)
    if (nextSpecial === -1) {
      elements.push(remaining)
      break
    } else if (nextSpecial === 0) {
      // No match, just add the character and continue
      elements.push(remaining[0])
      remaining = remaining.slice(1)
    } else {
      elements.push(remaining.slice(0, nextSpecial))
      remaining = remaining.slice(nextSpecial)
    }
  }

  return elements
}

/**
 * Code block component with syntax highlighting placeholder
 */
function CodeBlock({
  language,
  code,
  isStreaming
}: {
  language: string
  code: string
  isStreaming?: boolean
}) {
  return (
    <div className="my-2 rounded-lg overflow-hidden border border-[var(--border-primary)]">
      {language && (
        <div className="px-3 py-1.5 bg-[var(--bg-tertiary)] text-xs text-[var(--text-muted)] border-b border-[var(--border-primary)]">
          {language}
        </div>
      )}
      <pre className="p-3 bg-[var(--bg-secondary)] overflow-x-auto">
        <code className="text-sm font-mono text-[var(--text-primary)]">
          {code}
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-emerald-500 animate-pulse align-middle" />
          )}
        </code>
      </pre>
    </div>
  )
}
