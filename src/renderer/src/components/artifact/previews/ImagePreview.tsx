import React, { useState } from 'react'

interface ImagePreviewProps {
  content: string
  alt?: string
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ content, alt = 'Preview' }) => {
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return (
      <div className="flex items-center justify-center p-8 rounded-lg bg-white/10 backdrop-blur-lg border border-white/20 text-red-400">
        <span>Failed to load image</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center p-4 rounded-lg bg-white/10 backdrop-blur-lg border border-white/20 overflow-hidden">
      <img
        src={content}
        alt={alt}
        className="max-w-full h-auto rounded"
        onError={() => setHasError(true)}
      />
    </div>
  )
}
