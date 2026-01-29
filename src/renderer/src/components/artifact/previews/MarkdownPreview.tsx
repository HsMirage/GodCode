import React from 'react'
import Markdown from 'react-markdown'
import clsx from 'clsx'

interface MarkdownPreviewProps {
  content: string
  className?: string
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, className }) => {
  return (
    <div
      className={clsx(
        'bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg p-6 overflow-auto',
        'shadow-xl shadow-black/10',
        className
      )}
    >
      <div className="prose prose-invert max-w-none prose-headings:font-bold prose-a:text-blue-400 prose-code:bg-white/10 prose-code:rounded prose-code:px-1 prose-code:before:content-none prose-code:after:content-none">
        <Markdown>{content}</Markdown>
      </div>
    </div>
  )
}
