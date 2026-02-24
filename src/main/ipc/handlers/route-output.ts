import type { RouteResult } from '@/main/services/router/smart-router'
import { sanitizeCompletionOutput } from '@/main/services/workforce/output-sanitizer'

export function extractRouteOutput(result: RouteResult): string {
  if ('strategy' in result && result.strategy === 'direct') {
    return result.output
  }

  if ('taskId' in result) {
    return sanitizeCompletionOutput(result.output)
  }

  if ('workflowId' in result) {
    if (result.tasks.length === 0) {
      return '工作流执行完成：当前计划没有未完成任务。'
    }

    const taskSummary = result.tasks
      .map(task => {
        const execution = result.executions.get(task.id)
        const assignment = task.assignedAgent
          ? `执行: ${task.assignedAgent}`
          : task.assignedCategory
            ? `类别: ${task.assignedCategory}`
            : ''
        const model = execution?.model ? `模型: ${execution.model}` : ''
        const details = [assignment, model].filter(Boolean).join('，')
        return `- ${task.description}${details ? `（${details}）` : ''}`
      })
      .join('\n')

    const outputs = Array.from(result.results.entries())
      .map(([taskId, output]) => {
        const execution = result.executions.get(taskId)
        const heading = execution?.model ? `### ${taskId} (${execution.model})` : `### ${taskId}`
        const sanitizedOutput = sanitizeCompletionOutput(output)
        return `${heading}\n${sanitizedOutput}`
      })
      .join('\n\n---\n\n')

    const checkpoints = Array.isArray(result.orchestratorCheckpoints) ? result.orchestratorCheckpoints : []
    const checkpointSummary =
      checkpoints.length > 0
        ? (() => {
            const fallbackCount = checkpoints.filter(item => item.status === 'fallback').length
            const haltCount = checkpoints.filter(item => item.status === 'halt').length
            const last = checkpoints[checkpoints.length - 1]
            return [
              'Orchestrator Checkpoints:',
              `- 参与状态: ${result.orchestratorParticipation ? '已参与' : '未参与'}`,
              `- 总次数: ${checkpoints.length}`,
              `- 最后检查点: ${last.phase} / ${last.status}`,
              `- fallback次数: ${fallbackCount}`,
              `- halt次数: ${haltCount}`
            ].join('\n')
          })()
        : 'Orchestrator Checkpoints:\n- 参与状态: 未记录检查点'

    return `工作流执行完成。\n\n任务分解与分配:\n${taskSummary}\n\n${checkpointSummary}\n\n执行结果:\n\n${outputs}`
  }

  return ''
}
