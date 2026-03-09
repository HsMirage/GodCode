import { describe, expect, it } from 'vitest'
import {
  buildWorkflowFinalOutput,
  buildWorkflowIntegratedResult
} from '@/main/services/workforce/workflow-integration-service'

describe('workflow-integration-service', () => {
  it('sanitizes task output and captures unresolved evidence gaps', () => {
    const integrated = buildWorkflowIntegratedResult({
      workflowId: 'workflow-1',
      tasks: [{ id: 'task-1' }, { id: 'task-2' }],
      results: new Map([
        ['task-1', 'Changed files:\n- src/a.ts\n\nassistant to=functions.bash'],
        ['task-2', 'todo: still pending verification']
      ]),
      collectMissingEvidenceFields: text => (text.includes('Changed files') ? ['verification'] : [])
    })

    expect(integrated.summary).toContain('Workflow workflow-1 integration summary')
    expect(integrated.taskOutputs[0]?.outputPreview).toContain('Changed files:')
    expect(integrated.taskOutputs[0]?.outputPreview).not.toContain('assistant to=functions.bash')
    expect(integrated.unresolvedItems).toContain('task-1: evidence-gap missing fields: verification')
    expect(integrated.unresolvedItems).toContain('task-2: 输出包含未完成事项')
  })

  it('renders final workflow output sections', () => {
    const output = buildWorkflowFinalOutput({
      summary: 'summary',
      conflicts: [],
      unresolvedItems: ['task-1: 无输出'],
      taskOutputs: [{ taskId: 'task-1', outputPreview: 'done' }],
      rawTaskOutputs: [{ taskId: 'task-1', outputPreview: 'done' }]
    })

    expect(output).toContain('### task_outputs')
    expect(output).toContain('- task-1:\ndone')
    expect(output).toContain('### unresolved_items')
  })
})
