import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getStraightPath, type EdgeProps } from '@xyflow/react'

export const EdgeWithLabel = memo((props: EdgeProps) => {
  const { id, sourceX, sourceY, targetX, targetY, label } = props

  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY
  })

  return (
    <>
      <BaseEdge id={id} path={edgePath} className="!stroke-slate-600 !stroke-2" />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all'
            }}
            className="rounded bg-slate-800/90 px-2 py-1 text-xs text-slate-300 backdrop-blur"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

EdgeWithLabel.displayName = 'EdgeWithLabel'
