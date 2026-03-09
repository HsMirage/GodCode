export interface WorkflowGraphTaskInput {
  id: string
  dependencies?: string[]
}

export interface WorkflowGraphNode {
  taskId: string
  dependencies: string[]
  dependents: string[]
}

export interface WorkflowGraph {
  workflowId: string
  nodes: Map<string, WorkflowGraphNode>
  nodeOrder: string[]
}

export interface WorkflowGraphValidation {
  valid: boolean
  issues: string[]
}

export function buildWorkflowGraph(
  workflowId: string,
  tasks: WorkflowGraphTaskInput[]
): WorkflowGraph {
  const nodes = new Map<string, WorkflowGraphNode>()

  for (const task of tasks) {
    nodes.set(task.id, {
      taskId: task.id,
      dependencies: Array.from(new Set(task.dependencies || [])),
      dependents: []
    })
  }

  for (const node of nodes.values()) {
    for (const dependencyId of node.dependencies) {
      const dependencyNode = nodes.get(dependencyId)
      if (dependencyNode) {
        dependencyNode.dependents = Array.from(
          new Set([...dependencyNode.dependents, node.taskId])
        )
      }
    }
  }

  return {
    workflowId,
    nodes,
    nodeOrder: tasks.map(task => task.id)
  }
}

export function validateWorkflowGraph(graph: WorkflowGraph): WorkflowGraphValidation {
  const issues: string[] = []

  for (const node of graph.nodes.values()) {
    for (const dependencyId of node.dependencies) {
      if (!graph.nodes.has(dependencyId)) {
        issues.push(`任务 ${node.taskId} 依赖了不存在的任务 ${dependencyId}`)
      }
    }
  }

  const inDegree = new Map<string, number>()
  for (const node of graph.nodes.values()) {
    inDegree.set(node.taskId, node.dependencies.filter(dependencyId => graph.nodes.has(dependencyId)).length)
  }

  const queue: string[] = []
  for (const [taskId, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(taskId)
    }
  }

  let visited = 0
  while (queue.length > 0) {
    const currentTaskId = queue.shift()!
    visited++
    const currentNode = graph.nodes.get(currentTaskId)
    if (!currentNode) continue

    for (const dependentId of currentNode.dependents) {
      const nextDegree = (inDegree.get(dependentId) || 0) - 1
      inDegree.set(dependentId, nextDegree)
      if (nextDegree === 0) {
        queue.push(dependentId)
      }
    }
  }

  if (visited !== graph.nodes.size) {
    const blockedTaskIds = Array.from(inDegree.entries())
      .filter(([, degree]) => degree > 0)
      .map(([taskId]) => taskId)
    issues.push(`检测到循环依赖或不可调度任务: ${blockedTaskIds.join(', ')}`)
    throw new Error(issues.join(' | '))
  }

  return {
    valid: issues.length === 0,
    issues
  }
}
