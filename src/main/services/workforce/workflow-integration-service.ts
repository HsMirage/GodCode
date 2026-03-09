import { sanitizeCompletionOutput } from './output-sanitizer'

export interface WorkflowIntegrationTaskInput {
  id: string
}

export interface WorkflowIntegratorResult {
  summary: string
  conflicts: string[]
  unresolvedItems: string[]
  taskOutputs: Array<{ taskId: string; outputPreview: string }>
  rawTaskOutputs: Array<{ taskId: string; outputPreview: string }>
}

export function buildWorkflowIntegratedResult(input: {
  workflowId: string
  tasks: WorkflowIntegrationTaskInput[]
  results: Map<string, string>
  collectMissingEvidenceFields: (text: string) => string[]
}): WorkflowIntegratorResult {
  const rawTaskOutputs = input.tasks.map(task => {
    const rawOutput = (input.results.get(task.id) || '').trim()
    return {
      taskId: task.id,
      outputPreview: rawOutput.length > 360 ? `${rawOutput.slice(0, 360)}\n[...截断...]` : rawOutput
    }
  })

  const taskOutputs = rawTaskOutputs.map(item => ({
    taskId: item.taskId,
    outputPreview: sanitizeCompletionOutput(item.outputPreview).trim()
  }))

  const conflicts: string[] = []
  const unresolvedItems: string[] = []

  for (const item of taskOutputs) {
    const text = item.outputPreview
    if (!text) {
      unresolvedItems.push(`${item.taskId}: 无输出`)
    }
    if (/(conflict|冲突|inconsistent|不一致)/i.test(text)) {
      conflicts.push(`${item.taskId}: 输出中包含冲突信号`)
    }
    if (/(todo|待办|未完成|pending)/i.test(text)) {
      unresolvedItems.push(`${item.taskId}: 输出包含未完成事项`)
    }

    const missingEvidenceFields = input.collectMissingEvidenceFields(text)
    if (missingEvidenceFields.length > 0) {
      unresolvedItems.push(
        `${item.taskId}: evidence-gap missing fields: ${missingEvidenceFields.join(', ')}`
      )
    }
  }

  const summary = [
    `Workflow ${input.workflowId} integration summary`,
    `- total_tasks: ${input.tasks.length}`,
    `- conflicts: ${conflicts.length}`,
    `- unresolved: ${unresolvedItems.length}`
  ].join('\n')

  return {
    summary,
    conflicts,
    unresolvedItems,
    taskOutputs,
    rawTaskOutputs
  }
}

export function buildWorkflowFinalOutput(integrated: WorkflowIntegratorResult): string {
  return [
    integrated.summary,
    '',
    '### task_outputs',
    ...integrated.taskOutputs.map(item => `- ${item.taskId}:\n${item.outputPreview || '(empty)'}`),
    '',
    '### conflicts',
    ...(integrated.conflicts.length > 0 ? integrated.conflicts.map(item => `- ${item}`) : ['- (none)']),
    '',
    '### unresolved_items',
    ...(integrated.unresolvedItems.length > 0
      ? integrated.unresolvedItems.map(item => `- ${item}`)
      : ['- (none)'])
  ].join('\n')
}
