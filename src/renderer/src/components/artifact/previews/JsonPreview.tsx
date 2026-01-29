import ReactJson from 'react-json-view'
import React from 'react'

interface JsonPreviewProps {
  content: string
}

export const JsonPreview: React.FC<JsonPreviewProps> = ({ content }) => {
  try {
    const json = JSON.parse(content)
    return (
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg p-4 overflow-auto h-full">
        <ReactJson
          src={json}
          theme="monokai"
          style={{ backgroundColor: 'transparent' }}
          displayDataTypes={false}
        />
      </div>
    )
  } catch (error) {
    return (
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg p-4 text-red-400">
        Invalid JSON content
      </div>
    )
  }
}
