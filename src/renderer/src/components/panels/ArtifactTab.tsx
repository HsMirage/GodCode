import { ArtifactList } from '../artifact/ArtifactList'
import { TaskPanelSectionBoundary } from './TaskPanelSectionBoundary'

interface ArtifactTabProps {
  sessionId: string | null
  onViewDiff: (artifactId: string, filePath: string) => void
  onOpenFile: (artifactId: string, filePath: string) => void
}

export function ArtifactTab({ sessionId, onViewDiff, onOpenFile }: ArtifactTabProps) {
  return (
    <TaskPanelSectionBoundary title="产物列表" resetKey={sessionId || 'no-session'}>
      {sessionId ? (
        <ArtifactList sessionId={sessionId} onViewDiff={onViewDiff} onOpenFile={onOpenFile} />
      ) : (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          暂无会话，无法加载产物
        </div>
      )}
    </TaskPanelSectionBoundary>
  )
}
