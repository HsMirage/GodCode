import { randomUUID } from 'node:crypto'
import type { StructuredTaskBrief } from '@/shared/task-brief-contract'
import type { TaskTemplate } from '@/shared/task-template-library'

const FILE_PATH_PATTERN =
  /(?:^|[\s`'"(])(?:\.{1,2}[\/]|[A-Za-z0-9_.-]+[\/])[A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,12}(?=$|[\s`'"),:;!?])/gm

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map(item => item.trim()).filter(Boolean)))
}

function extractLinesAfterKeyword(input: string, keywordPattern: RegExp): string[] {
  const lines = input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  const startIndex = lines.findIndex(line => keywordPattern.test(line))
  if (startIndex < 0) {
    return []
  }

  const collected: string[] = []
  for (let index = startIndex + 1; index < lines.length; index++) {
    const line = lines[index]
    if (/^(?:#+\s+)?(?:目标|输入|允许修改|禁止修改|执行步骤|验收标准|输出归档|acceptance|output archive)/i.test(line)) {
      break
    }
    collected.push(line.replace(/^[-*]\s*/, '').trim())
  }
  return dedupe(collected)
}

function extractSentence(input: string): string {
  const normalized = input.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '完成用户要求的任务，并保持结果可验证。'
  }
  const firstSentence = normalized.split(/(?<=[。.!?])\s+/)[0]?.trim() || normalized
  return firstSentence.slice(0, 180)
}

function extractPaths(input: string): string[] {
  const matches = input.match(FILE_PATH_PATTERN) || []
  return dedupe(matches.map(item => item.trim().replace(/^[(`'"\s]+|[)`'"\s]+$/g, '')))
}

function inferForbiddenScopes(input: string): string[] {
  const explicit = extractLinesAfterKeyword(input, /(?:禁止修改|禁止改动|forbidden|do not modify)/i)
  if (explicit.length > 0) {
    return explicit
  }
  if (/(只读|不要改代码|不修改文件|read-?only|no file changes?)/i.test(input)) {
    return ['禁止修改任何代码或文件，仅允许分析与输出方案。']
  }
  return ['不要修改未在任务范围内明确涉及的文件。']
}

function inferAllowedScopes(input: string, inputFiles: string[]): string[] {
  const explicit = extractLinesAfterKeyword(input, /(?:允许修改|可修改范围|allowed modifications?)/i)
  if (explicit.length > 0) {
    return explicit
  }
  if (inputFiles.length > 0) {
    return inputFiles.map(file => `优先限制在 ${file} 及其直接相关实现范围内修改。`)
  }
  return ['仅修改与当前目标直接相关的最小必要范围。']
}

function inferAcceptanceCriteria(
  input: string,
  readOnly: boolean,
  taskTemplate?: Pick<TaskTemplate, 'acceptanceCriteria'> | null
): string[] {
  const explicit = extractLinesAfterKeyword(input, /(?:验收标准|验收|acceptance|definition of done)/i)
  if (explicit.length > 0) {
    return explicit
  }
  if (taskTemplate?.acceptanceCriteria?.length) {
    return taskTemplate.acceptanceCriteria
  }
  return readOnly
    ? ['输出方案需覆盖目标、涉及文件、验证方式与风险说明。']
    : ['结果必须完成目标且不越界修改。', '至少执行 1 条相关验证命令并记录结果。', '最终输出需对齐任务卡中的验收项。']
}

function inferExecutionSteps(
  readOnly: boolean,
  taskTemplate?: Pick<TaskTemplate, 'executionSteps'> | null
): string[] {
  if (taskTemplate?.executionSteps?.length) {
    return taskTemplate.executionSteps
  }
  return readOnly
    ? ['阅读相关上下文与输入文件。', '整理可执行方案与风险。', '给出具体验证步骤与交付摘要。']
    : ['阅读相关上下文与输入文件。', '在允许范围内完成实现或修复。', '执行最小必要验证。', '按验收项总结结果与归档输出。']
}

export function buildStructuredTaskBrief(input: {
  rawInput: string
  strategy: StructuredTaskBrief['strategy']
  complexityScore: number
  taskTemplate?: Pick<TaskTemplate, 'key' | 'label' | 'acceptanceCriteria' | 'executionSteps'> | null
}): StructuredTaskBrief | null {
  if (input.strategy === 'direct' && input.complexityScore < 0.55) {
    return null
  }

  const raw = input.rawInput.trim()
  const inputFiles = extractPaths(raw)
  const readOnly = /(只读|不要改代码|不修改文件|read-?only|no file changes?)/i.test(raw)

  return {
    briefId: `brief-${randomUUID().slice(0, 8)}`,
    templateKey: input.taskTemplate?.key,
    templateLabel: input.taskTemplate?.label,
    source: 'auto',
    strategy: input.strategy,
    complexityScore: input.complexityScore,
    goal: extractSentence(raw),
    inputFiles,
    logs: extractLinesAfterKeyword(raw, /(?:日志|错误日志|logs?)/i),
    allowedModificationScope: inferAllowedScopes(raw, inputFiles),
    forbiddenModificationScope: inferForbiddenScopes(raw),
    executionSteps: inferExecutionSteps(readOnly, input.taskTemplate),
    acceptanceCriteria: inferAcceptanceCriteria(raw, readOnly, input.taskTemplate),
    outputArchive: ['最终改动摘要', '验证命令与结果', '风险/后续事项（如有）'],
    generatedAt: new Date().toISOString()
  }
}
