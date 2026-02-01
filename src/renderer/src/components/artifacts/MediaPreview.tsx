import { cn } from '../../utils'

interface MediaPreviewProps {
  artifact: {
    name: string
    path: string
    content: string
    type: 'image' | 'html'
  }
}

export function MediaPreview({ artifact }: MediaPreviewProps) {
  if (artifact.type === 'image') {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-900 p-8">
        <div className="relative max-w-full max-h-full shadow-2xl rounded-lg overflow-hidden border border-slate-700">
          <img
            src={
              artifact.content.startsWith('data:') ? artifact.content : `file://${artifact.path}`
            }
            alt={artifact.name}
            className="max-w-full max-h-full object-contain"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm text-white text-xs p-2 truncate text-center">
            {artifact.name}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-white">
      <iframe
        title={artifact.name}
        srcDoc={artifact.content}
        className="w-full h-full border-none"
        sandbox="allow-scripts"
      />
    </div>
  )
}
