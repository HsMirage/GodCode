export interface TaskTemplate {
  key:
    | 'bug_fix'
    | 'feature_development'
    | 'refactor'
    | 'documentation'
    | 'test_backfill'
    | 'release_validation'
    | 'browser_automation'
  label: string
  defaultStrategy: 'delegate' | 'workforce'
  recommendedCategory?: string
  recommendedSubagent?: string
  suggestedToolScope: string[]
  riskLevel: 'low' | 'medium' | 'high'
  acceptanceCriteria: string[]
  executionSteps?: string[]
  patterns: RegExp[]
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    key: 'bug_fix',
    label: 'Bug 修复任务',
    defaultStrategy: 'delegate',
    recommendedCategory: 'dayu',
    suggestedToolScope: ['read', 'edit', 'grep', 'bash'],
    riskLevel: 'medium',
    acceptanceCriteria: ['问题可稳定复现并被修复。', '至少执行 1 条相关验证命令。', '输出根因与修复摘要。'],
    patterns: [/bug|修复|报错|异常|错误|fail|失败|回归/i]
  },
  {
    key: 'feature_development',
    label: '小功能开发任务',
    defaultStrategy: 'workforce',
    recommendedCategory: 'dayu',
    suggestedToolScope: ['read', 'edit', 'bash'],
    riskLevel: 'medium',
    acceptanceCriteria: ['功能实现完成并符合目标。', '补充最小必要验证。', '总结改动范围与风险。'],
    patterns: [/功能|feature|实现|创建|新增/i]
  },
  {
    key: 'refactor',
    label: '重构任务',
    defaultStrategy: 'workforce',
    recommendedCategory: 'dayu',
    suggestedToolScope: ['read', 'edit', 'grep', 'bash'],
    riskLevel: 'high',
    acceptanceCriteria: ['重构后行为保持一致。', '关键测试或类型检查通过。', '列出受影响模块与兼容性风险。'],
    patterns: [/重构|refactor|拆分|治理|解耦/i]
  },
  {
    key: 'documentation',
    label: '文档任务',
    defaultStrategy: 'delegate',
    recommendedCategory: 'cangjie',
    suggestedToolScope: ['read', 'edit'],
    riskLevel: 'low',
    acceptanceCriteria: ['文档内容与当前实现一致。', '示例/路径/命令可读可执行。'],
    patterns: [/文档|README|说明|注释|guide|docs?/i]
  },
  {
    key: 'test_backfill',
    label: '测试补齐任务',
    defaultStrategy: 'delegate',
    recommendedCategory: 'dayu',
    suggestedToolScope: ['read', 'edit', 'bash'],
    riskLevel: 'medium',
    acceptanceCriteria: ['新增或修复目标测试。', '相关测试执行通过。', '不引入无关改动。'],
    patterns: [/测试|test|单测|集成测试|e2e|回归/i]
  },
  {
    key: 'release_validation',
    label: '发版验证任务',
    defaultStrategy: 'workforce',
    recommendedCategory: 'dayu',
    suggestedToolScope: ['read', 'bash', 'browser_navigate'],
    riskLevel: 'high',
    acceptanceCriteria: ['执行发布门禁命令并记录结果。', '明确 PASS/FAIL/BLOCKED。', '归档证据路径。'],
    patterns: [/发版|发布|release|preflight|构建验证|门禁/i]
  },
  {
    key: 'browser_automation',
    label: '浏览器自动化任务',
    defaultStrategy: 'delegate',
    recommendedSubagent: 'luban',
    suggestedToolScope: ['browser_navigate', 'browser_click', 'browser_fill', 'browser_snapshot'],
    riskLevel: 'high',
    acceptanceCriteria: ['浏览器链路执行成功。', '记录关键页面状态或提取结果。', '说明是否触发审批或人工接管。'],
    patterns: [/浏览器|browser|navigate|click|fill|网页|页面自动化/i]
  }
]

export function matchTaskTemplate(input: string): TaskTemplate | null {
  const normalized = input.trim()
  if (!normalized) {
    return null
  }

  return TASK_TEMPLATES.find(template => template.patterns.some(pattern => pattern.test(normalized))) || null
}
