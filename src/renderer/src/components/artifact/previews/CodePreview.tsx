import React, { useState } from 'react'
import { Highlight, themes } from 'prism-react-renderer'
import { Check, Copy } from 'lucide-react'
import { clsx } from 'clsx'

interface CodePreviewProps {
  content: string
  language?: string
}

export const CodePreview: React.FC<CodePreviewProps> = ({ content, language = 'tsx' }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg overflow-hidden w-full my-4 shadow-lg group">
      <div className="flex justify-between items-center px-4 py-2 bg-white/5 border-b border-white/10">
        <span className="text-xs font-mono text-white/60 uppercase tracking-wider">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 rounded-md hover:bg-white/10 text-white/60 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
          title="Copy to clipboard"
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </button>
      </div>

      <div className="relative overflow-auto max-h-[500px] scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        <Highlight theme={themes.nightOwl} code={content} language={language}>
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className={clsx(
                className,
                'p-4 text-sm font-mono !bg-transparent float-left min-w-full'
              )}
              style={{ ...style, background: 'transparent' }}
            >
              {tokens.map((line, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i} {...getLineProps({ line, key: i })} className="table-row">
                  <span className="table-cell text-right select-none text-white/30 pr-4 w-8 text-xs align-top">
                    {i + 1}
                  </span>
                  <span className="table-cell align-top">
                    {line.map((token, key) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <span key={key} {...getTokenProps({ token, key })} />
                    ))}
                  </span>
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  )
}
