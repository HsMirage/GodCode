export type ModelSelectionSource =
  | 'override'
  | 'agent-binding'
  | 'category-binding'
  | 'system-default'

export type ModelSelectionReason =
  | 'explicit-override'
  | 'agent-binding-hit'
  | 'category-binding-hit'
  | 'system-default-hit'

export type FallbackReason =
  | 'override-not-requested'
  | 'binding-not-requested'
  | 'binding-not-configured'
  | 'binding-disabled'
  | 'binding-model-unset'
  | 'system-default-not-configured'

export type ModelSelectionAttemptReason = ModelSelectionReason | FallbackReason

export type ModelSelectionAttemptStatus = 'selected' | 'fallback' | 'skipped'

export interface ModelSelectionAttemptSummary {
  source: ModelSelectionSource
  status: ModelSelectionAttemptStatus
  reason: ModelSelectionAttemptReason
  summary: string
  bindingCode?: string
  bindingName?: string
  modelId?: string
  modelName?: string
  provider?: string
}

export interface ModelSelectionTrace {
  modelSelectionSource: ModelSelectionSource
  modelSelectionReason: ModelSelectionReason
  modelSelectionSummary: string
  fallbackReason?: FallbackReason
  fallbackAttemptSummary: ModelSelectionAttemptSummary[]
}

export interface ModelSelectionSnapshot extends ModelSelectionTrace {
  modelId?: string
  provider?: string
  model?: string
}

export function getModelSelectionSourceLabel(source: ModelSelectionSource): string {
  switch (source) {
    case 'override':
      return '用户覆盖'
    case 'agent-binding':
      return 'Agent 绑定'
    case 'category-binding':
      return '类别绑定'
    case 'system-default':
      return '系统默认'
  }
}

export function getModelSelectionReasonLabel(reason: ModelSelectionReason): string {
  switch (reason) {
    case 'explicit-override':
      return '命中显式覆盖'
    case 'agent-binding-hit':
      return '命中 Agent 绑定'
    case 'category-binding-hit':
      return '命中类别绑定'
    case 'system-default-hit':
      return '命中系统默认'
  }
}

export function getFallbackReasonLabel(reason: FallbackReason): string {
  switch (reason) {
    case 'override-not-requested':
      return '未请求覆盖模型'
    case 'binding-not-requested':
      return '未提供对应绑定上下文'
    case 'binding-not-configured':
      return '绑定未配置'
    case 'binding-disabled':
      return '绑定已禁用'
    case 'binding-model-unset':
      return '绑定未设置模型'
    case 'system-default-not-configured':
      return '系统默认模型未配置'
  }
}
