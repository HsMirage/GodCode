export interface StructuredTaskBrief {
  briefId: string
  taskId?: string
  templateKey?: string
  templateLabel?: string
  source: 'auto'
  strategy: 'delegate' | 'workforce' | 'direct'
  complexityScore: number
  goal: string
  inputFiles: string[]
  logs: string[]
  allowedModificationScope: string[]
  forbiddenModificationScope: string[]
  executionSteps: string[]
  acceptanceCriteria: string[]
  outputArchive: string[]
  generatedAt: string
}

function renderList(title: string, items: string[]): string[] {
  if (items.length === 0) {
    return [title, '- (none)']
  }
  return [title, ...items.map(item => `- ${item}`)]
}

export function renderTaskBriefMarkdown(brief: StructuredTaskBrief): string {
  return [
    '### 任务卡',
    `- 任务ID：${brief.taskId || brief.briefId}`,
    brief.templateLabel ? `- 模板：${brief.templateLabel}` : null,
    `- 生成来源：${brief.source}`,
    `- 执行策略：${brief.strategy}`,
    `- 复杂度分：${brief.complexityScore.toFixed(2)}`,
    '',
    '#### 目标',
    `- ${brief.goal}`,
    '',
    '#### 输入',
    ...renderList('文件：', brief.inputFiles),
    ...renderList('日志：', brief.logs),
    '',
    '#### 允许修改',
    ...brief.allowedModificationScope.map(item => `- ${item}`),
    '',
    '#### 禁止修改',
    ...brief.forbiddenModificationScope.map(item => `- ${item}`),
    '',
    '#### 执行步骤',
    ...brief.executionSteps.map(item => `- ${item}`),
    '',
    '#### 验收标准',
    ...brief.acceptanceCriteria.map(item => `- ${item}`),
    '',
    '#### 输出归档',
    ...brief.outputArchive.map(item => `- ${item}`)
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n')
}
