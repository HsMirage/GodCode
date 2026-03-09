import { FileCode, ListTodo, RefreshCw, Terminal, X } from 'lucide-react'
import { DiffViewer } from '../artifact/DiffViewer'
import { ArtifactTab } from './ArtifactTab'
import { BackgroundTaskTab } from './BackgroundTaskTab'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { TaskListTab } from './TaskListTab'
import { WorkflowObservability } from './WorkflowObservability'
import { useTaskPanel } from './hooks/useTaskPanel'
import { useUIStore } from '../../store/ui.store'

export function TaskPanel() {
  const { closeTaskPanel } = useUIStore()
  const panel = useTaskPanel()

  const activeRefreshLoading = panel.activeTab === 'tasks' ? panel.loading : panel.backgroundLoading

  return (
    <div className="ui-bg-panel flex h-full flex-col border-l ui-border">
      <div className="flex items-center justify-between border-b px-4 py-3 ui-border">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-[var(--bg-tertiary)] p-0.5">
            <button
              type="button"
              onClick={() => panel.setActiveTab('tasks')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                panel.activeTab === 'tasks'
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <ListTodo className="h-3.5 w-3.5" />
              任务
            </button>
            <button
              type="button"
              onClick={() => panel.setActiveTab('background')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                panel.activeTab === 'background'
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              终端
            </button>
            <button
              type="button"
              onClick={() => panel.setActiveTab('artifacts')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                panel.activeTab === 'artifacts'
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              产物
            </button>
          </div>
          {panel.activeTab === 'tasks' && panel.runningTasks.length > 0 && (
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-xs text-sky-400">
              {panel.runningTasks.length} 运行中
            </span>
          )}
          {panel.activeTab === 'background' && panel.backgroundRunning.length > 0 && (
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-xs text-sky-400">
              {panel.backgroundRunning.length} 运行中
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {(panel.activeTab === 'tasks' || panel.activeTab === 'background') && (
            <button
              type="button"
              onClick={panel.reloadActiveTab}
              disabled={activeRefreshLoading}
              className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${activeRefreshLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={closeTaskPanel}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <WorkflowObservability
          activeTab={panel.activeTab}
          taskReadinessDashboard={panel.taskReadinessDashboard}
          stuckDiagnosticSummary={panel.stuckDiagnosticSummary}
          sessionDiagnosticSummary={panel.sessionDiagnosticSummary}
        />

        {panel.activeTab === 'tasks' ? (
          <TaskListTab
            loading={panel.loading}
            error={panel.taskError}
            tasks={panel.tasks}
            filteredTasks={panel.filteredTasks}
            runningTasks={panel.runningTasks}
            pendingTasks={panel.pendingTasks}
            completedTasks={panel.completedTasks}
            taskSearch={panel.taskSearch}
            taskStatusFilter={panel.taskStatusFilter}
            taskSortMode={panel.taskSortMode}
            completedTaskLimit={panel.completedTaskLimit}
            hasTaskFilters={panel.hasTaskFilters}
            bindingSnapshots={panel.bindingSnapshots}
            taskDiagnosticsByTaskId={panel.taskDiagnosticsByTaskId}
            highlightedTaskId={panel.highlightedTaskId}
            onTaskSearchChange={panel.setTaskSearch}
            onTaskStatusFilterChange={panel.setTaskStatusFilter}
            onTaskSortModeChange={panel.setTaskSortMode}
            onCompletedTaskLimitChange={panel.setCompletedTaskLimit}
            onResetFilters={panel.resetTaskFilters}
            onRetry={panel.refreshTasks}
            onTaskLinkage={panel.handleTaskLinkage}
            onTaskDetail={panel.openTaskDetail}
            onTaskOutput={panel.openTaskOutput}
          />
        ) : panel.activeTab === 'background' ? (
          <BackgroundTaskTab
            loading={panel.backgroundLoading}
            error={panel.backgroundError}
            backgroundTasks={panel.backgroundTasks}
            backgroundRunning={panel.backgroundRunning}
            backgroundFinished={panel.backgroundFinished}
            expandedTaskIds={panel.expandedTaskIds}
            outputByTaskId={panel.outputByTaskId}
            onRetry={panel.refreshBackgroundTasks}
            onCancelTask={panel.handleCancelBackgroundTask}
            onToggleTaskExpanded={panel.toggleTaskExpanded}
          />
        ) : (
          <ArtifactTab
            sessionId={panel.currentSessionId}
            onViewDiff={panel.handleViewDiff}
            onOpenFile={panel.handleOpenArtifactInCanvas}
          />
        )}
      </div>

      <TaskDetailDrawer
        taskDetailState={panel.taskDetailState}
        taskDetailTab={panel.taskDetailTab}
        diagnosticCopyState={panel.diagnosticCopyState}
        taskDetailDiagnostic={panel.taskDetailDiagnostic}
        taskDetailBindingSnapshot={panel.taskDetailBindingSnapshot}
        onClose={panel.closeTaskDetail}
        onTabChange={panel.setTaskDetailTab}
        onCopyDiagnosticPackage={panel.copyDiagnosticPackage}
      />

      {panel.diffViewerState && (
        <DiffViewer
          artifactId={panel.diffViewerState.artifactId}
          filePath={panel.diffViewerState.filePath}
          onClose={panel.closeDiffViewer}
        />
      )}
    </div>
  )
}
