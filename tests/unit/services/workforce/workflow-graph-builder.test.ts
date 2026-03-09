import { describe, expect, it } from 'vitest'
import {
  buildWorkflowGraph,
  validateWorkflowGraph
} from '@/main/services/workforce/workflow-graph-builder'

describe('workflow-graph-builder', () => {
  it('builds graph nodes, deduplicates dependencies, and records dependents', () => {
    const graph = buildWorkflowGraph('workflow-1', [
      { id: 'task-1', dependencies: [] },
      { id: 'task-2', dependencies: ['task-1', 'task-1'] },
      { id: 'task-3', dependencies: ['task-1', 'task-2'] }
    ])

    expect(graph.workflowId).toBe('workflow-1')
    expect(graph.nodeOrder).toEqual(['task-1', 'task-2', 'task-3'])
    expect(graph.nodes.get('task-2')).toEqual({
      taskId: 'task-2',
      dependencies: ['task-1'],
      dependents: ['task-3']
    })
    expect(graph.nodes.get('task-1')?.dependents).toEqual(['task-2', 'task-3'])
  })

  it('reports missing dependency issues', () => {
    const graph = buildWorkflowGraph('workflow-1', [
      { id: 'task-1', dependencies: ['task-404'] }
    ])

    expect(validateWorkflowGraph(graph)).toEqual({
      valid: false,
      issues: ['任务 task-1 依赖了不存在的任务 task-404']
    })
  })

  it('reports circular dependencies as unschedulable tasks', () => {
    const graph = buildWorkflowGraph('workflow-1', [
      { id: 'task-1', dependencies: ['task-2'] },
      { id: 'task-2', dependencies: ['task-1'] }
    ])

    expect(() => validateWorkflowGraph(graph)).toThrowError(
      '检测到循环依赖或不可调度任务: task-1, task-2'
    )
  })
})
