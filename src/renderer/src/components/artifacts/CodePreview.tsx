import Editor, { loader } from '@monaco-editor/react'
import { detectLanguage } from '../../utils/language'

loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs'
  }
})

interface CodePreviewProps {
  content: string
  fileName: string
}

export function CodePreview({ content, fileName }: CodePreviewProps) {
  const language = detectLanguage(fileName)

  return (
    <div className="h-full w-full bg-[#1e1e1e]">
      <Editor
        height="100%"
        language={language}
        theme="vs-dark"
        value={content}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
          padding: { top: 16, bottom: 16 },
          lineNumbers: 'on',
          renderWhitespace: 'selection'
        }}
        loading={
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            Loading editor...
          </div>
        }
      />
    </div>
  )
}
