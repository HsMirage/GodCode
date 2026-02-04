import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Task } from '@/types/domain'
import { TaskNode, type TaskNodeData } from './TaskNode'
import { EdgeWithLabel } from './EdgeWithLabel'

const nodeTypes = {
  task: TaskNode
}

const edgeTypes = {
  default: EdgeWithLabel
}

interface WorkflowViewProps {
  sessionId: string
}

export function WorkflowView({ sessionId }: WorkflowViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TaskNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [isLoading, setIsLoading] = useState(true)

  const convertTasksToFlow = useCallback((tasks: Task[]) => {
    const flowNodes: Node<TaskNodeData>[] = []
    const flowEdges: Edge[] = []
    const taskMap = new Map<string, Task>()

    tasks.forEach(task => {
      taskMap.set(task.id, task)
    })

    const taskLevels = new Map<string, number>()
    const calculateLevel = (task: Task, visited = new Set<string>()): number => {
      if (taskLevels.has(task.id)) return taskLevels.get(task.id)!
      if (visited.has(task.id)) return 0

      visited.add(task.id)
      const dependencies = (task.metadata?.dependencies as string[]) || []
      const maxDepLevel = dependencies.reduce((max, depId) => {
        const depTask = taskMap.get(depId)
        return depTask ? Math.max(max, calculateLevel(depTask, visited)) : max
      }, 0)

      const level = maxDepLevel + 1
      taskLevels.set(task.id, level)
      return level
    }

    tasks.forEach(task => calculateLevel(task))

    const levelGroups = new Map<number, Task[]>()
    tasks.forEach(task => {
      const level = taskLevels.get(task.id) || 0
      if (!levelGroups.has(level)) {
        levelGroups.set(level, [])
      }
      levelGroups.get(level)!.push(task)
    })

    tasks.forEach((task, _index) => {
      const level = taskLevels.get(task.id) || 0
      const levelTasks = levelGroups.get(level) || []
      const positionInLevel = levelTasks.indexOf(task)

      const duration =
        task.startedAt && task.completedAt
          ? (new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000
          : undefined

      flowNodes.push({
        id: task.id,
        type: 'task',
        position: {
          x: positionInLevel * 320 + 50,
          y: level * 200 + 50
        },
        data: {
          task,
          duration
        }
      })

      const dependencies = (task.metadata?.dependencies as string[]) || []
      dependencies.forEach(depId => {
        if (taskMap.has(depId)) {
          flowEdges.push({
            id: `${depId}-${task.id}`,
            source: depId,
            target: task.id,
            type: 'default'
          })
        }
      })
    })

    return { nodes: flowNodes, edges: flowEdges }
  }, [])

  useEffect(() => {
    // Skip if not running in Electron environment
    if (!window.codeall) {
      console.warn('[WorkflowView] window.codeall not available')
      setIsLoading(false)
      return
    }

    const loadTasks = async () => {
      setIsLoading(true)
      try {
        const tasks = (await window.codeall.invoke('task:list', sessionId)) as Task[]
        const { nodes: flowNodes, edges: flowEdges } = convertTasksToFlow(tasks)
        setNodes(flowNodes)
        setEdges(flowEdges)
      } catch (error) {
        console.error('Failed to load workflow tasks:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadTasks()
  }, [sessionId, convertTasksToFlow, setNodes, setEdges])

  useEffect(() => {
    // Skip if not running in Electron environment
    if (!window.codeall) {
      return
    }

    const handleStatusChange = (event: { taskId: string; status: Task['status'] }) => {
      setNodes(nds =>
        nds.map(node => {
          if (node.id === event.taskId) {
            const task = node.data.task
            return {
              ...node,
              data: {
                ...node.data,
                task: {
                  ...task,
                  status: event.status
                }
              }
            }
          }
          return node
        })
      )
    }

    const removeListener = window.codeall.on('task:status-changed', handleStatusChange)
    return () => {
      removeListener()
    }
  }, [setNodes])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-slate-400">加载工作流...</div>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400">当前会话暂无工作流任务</p>
          <p className="mt-2 text-sm text-slate-500">使用 Workforce 模式创建任务后将显示流程图</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full rounded-2xl border border-slate-800/70 bg-slate-950/70 backdrop-blur">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background className="bg-slate-950" gap={16} size={1} color="#1e293b" />
        <Controls className="rounded-lg border border-slate-800/70 bg-slate-900/90 backdrop-blur [&_button]:border-slate-700 [&_button]:bg-slate-800/50 [&_button]:text-slate-300 [&_button:hover]:bg-slate-700/50" />
        <MiniMap
          className="rounded-lg border border-slate-800/70 bg-slate-900/90 backdrop-blur"
          nodeColor={node => {
            const task = (node.data as TaskNodeData).task
            const colors = {
              pending: '#475569',
              running: '#0ea5e9',
              completed: '#10b981',
              failed: '#f43f5e',
              cancelled: '#f59e0b'
            }
            return colors[task.status]
          }}
        />
      </ReactFlow>
    </div>
  )
}
