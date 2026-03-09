export type ReleaseGateLayer = 'platform' | 'agent-capability'
export type ReleaseGateStatus = 'PASS' | 'FAIL' | 'BLOCKED'

export interface ReleaseGateDefinition {
  id:
    | 'RLS-BUILD-WIN'
    | 'RLS-BUILD-MAC'
    | 'RLS-BOOT-WIN'
    | 'RLS-BOOT-MAC'
    | 'RLS-FLOW-CHAT'
    | 'RLS-FLOW-DELEGATE'
    | 'RLS-FLOW-BROWSER'
  label: string
  layer: ReleaseGateLayer
  platform: 'Windows' | 'macOS' | 'Windows/macOS'
  description: string
}

export interface ReleaseGateResult {
  id: ReleaseGateDefinition['id']
  status: ReleaseGateStatus
  evidencePath?: string
  note?: string
}

export interface ReleaseGateLayerSummary {
  layer: ReleaseGateLayer
  label: string
  total: number
  pass: number
  fail: number
  blocked: number
  status: ReleaseGateStatus
}

export interface ReleaseGateEvaluation {
  overallStatus: ReleaseGateStatus
  layers: ReleaseGateLayerSummary[]
  missingRequiredIds: ReleaseGateDefinition['id'][]
  failingIds: ReleaseGateDefinition['id'][]
  blockedIds: ReleaseGateDefinition['id'][]
}

export const RELEASE_GATE_DEFINITIONS: ReleaseGateDefinition[] = [
  {
    id: 'RLS-BUILD-WIN',
    label: 'Windows Build',
    layer: 'platform',
    platform: 'Windows',
    description: '构建 Windows 安装包。'
  },
  {
    id: 'RLS-BUILD-MAC',
    label: 'macOS Build',
    layer: 'platform',
    platform: 'macOS',
    description: '构建 macOS 安装包。'
  },
  {
    id: 'RLS-BOOT-WIN',
    label: 'Windows Boot',
    layer: 'platform',
    platform: 'Windows',
    description: '启动打包后的 Windows 应用并确认不发生启动链崩溃。'
  },
  {
    id: 'RLS-BOOT-MAC',
    label: 'macOS Boot',
    layer: 'platform',
    platform: 'macOS',
    description: '启动打包后的 macOS 应用并确认不发生启动链崩溃。'
  },
  {
    id: 'RLS-FLOW-CHAT',
    label: 'Core Chat Flow',
    layer: 'agent-capability',
    platform: 'Windows/macOS',
    description: '创建会话、发送消息并返回响应。'
  },
  {
    id: 'RLS-FLOW-DELEGATE',
    label: 'Delegate / Workforce Flow',
    layer: 'agent-capability',
    platform: 'Windows/macOS',
    description: '执行委派/编排任务并进入终态。'
  },
  {
    id: 'RLS-FLOW-BROWSER',
    label: 'AI Browser Flow',
    layer: 'agent-capability',
    platform: 'Windows/macOS',
    description: '执行浏览器导航/提取链路。'
  }
]

function evaluateLayerStatus(results: ReleaseGateResult[]): ReleaseGateStatus {
  if (results.some(result => result.status === 'FAIL')) {
    return 'FAIL'
  }

  if (results.some(result => result.status === 'BLOCKED')) {
    return 'BLOCKED'
  }

  return 'PASS'
}

export function evaluateReleaseGateResults(results: ReleaseGateResult[]): ReleaseGateEvaluation {
  const resultMap = new Map(results.map(result => [result.id, result]))
  const missingRequiredIds = RELEASE_GATE_DEFINITIONS.filter(definition => !resultMap.has(definition.id)).map(
    definition => definition.id
  )
  const failingIds = results.filter(result => result.status === 'FAIL').map(result => result.id)
  const blockedIds = [
    ...results.filter(result => result.status === 'BLOCKED').map(result => result.id),
    ...missingRequiredIds
  ]

  const layers: ReleaseGateLayerSummary[] = (['platform', 'agent-capability'] as ReleaseGateLayer[]).map(layer => {
    const definitions = RELEASE_GATE_DEFINITIONS.filter(definition => definition.layer === layer)
    const layerResults = definitions.map(definition => resultMap.get(definition.id) || { id: definition.id, status: 'BLOCKED' as const })
    const pass = layerResults.filter(result => result.status === 'PASS').length
    const fail = layerResults.filter(result => result.status === 'FAIL').length
    const blocked = layerResults.filter(result => result.status === 'BLOCKED').length

    return {
      layer,
      label: layer === 'platform' ? 'Platform Release Gates' : 'Agent Capability Gates',
      total: definitions.length,
      pass,
      fail,
      blocked,
      status: evaluateLayerStatus(layerResults)
    }
  })

  const overallStatus = evaluateLayerStatus([
    ...results,
    ...missingRequiredIds.map(id => ({ id, status: 'BLOCKED' as const }))
  ])

  return {
    overallStatus,
    layers,
    missingRequiredIds,
    failingIds,
    blockedIds
  }
}
