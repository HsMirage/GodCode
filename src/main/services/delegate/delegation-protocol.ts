/**
 * Copyright (c) 2026 GodCode Team
 * SPDX-License-Identifier: MIT
 *
 * 委托协议 — 6 节结构化任务委托格式
 *
 * 每个委托必须包含完整的 6 节结构，确保子代理有足够的上下文执行任务。
 */

/**
 * 委托协议节结构
 */
export interface DelegationSection {
  /** 节标题 */
  title: string
  /** 节内容 */
  content: string
  /** 是否必需 */
  required: boolean
}

/**
 * 完整的委托协议
 */
export interface DelegationProtocol {
  /** 1. 任务描述 - 原子化、具体的目标 */
  task: DelegationSection
  /** 2. 预期结果 - 具体的可交付成果和成功标准 */
  expectedOutcome: DelegationSection
  /** 3. 可用工具 - 明确的工具白名单 */
  requiredTools: DelegationSection
  /** 4. 必须做 - 详尽的要求列表 */
  mustDo: DelegationSection
  /** 5. 禁止做 - 禁止的行为列表 */
  mustNotDo: DelegationSection
  /** 6. 上下文信息 - 文件路径、现有模式、约束 */
  context: DelegationSection
}

/**
 * 委托协议输入
 */
export interface DelegationProtocolInput {
  /** 任务描述 */
  task: string
  /** 预期结果 */
  expectedOutcome: string
  /** 可用工具列表 */
  requiredTools?: string[]
  /** 必须做的要求列表 */
  mustDo?: string[]
  /** 禁止做的行为列表 */
  mustNotDo?: string[]
  /** 上下文信息 */
  context?: {
    filePaths?: string[]
    existingPatterns?: string[]
    constraints?: string[]
    additionalInfo?: string
  }
}

/**
 * 委托协议验证结果
 */
export interface DelegationValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * 构建委托协议
 */
export function buildDelegationProtocol(input: DelegationProtocolInput): DelegationProtocol {
  return {
    task: {
      title: 'TASK',
      content: input.task,
      required: true
    },
    expectedOutcome: {
      title: 'EXPECTED OUTCOME',
      content: input.expectedOutcome,
      required: true
    },
    requiredTools: {
      title: 'REQUIRED TOOLS',
      content: input.requiredTools?.length ? input.requiredTools.join(', ') : 'Any available tools',
      required: false
    },
    mustDo: {
      title: 'MUST DO',
      content: input.mustDo?.length
        ? input.mustDo.map((item, i) => `${i + 1}. ${item}`).join('\n')
        : 'Follow standard best practices',
      required: true
    },
    mustNotDo: {
      title: 'MUST NOT DO',
      content: input.mustNotDo?.length
        ? input.mustNotDo.map((item, i) => `${i + 1}. ${item}`).join('\n')
        : 'Do not introduce breaking changes without explicit approval',
      required: true
    },
    context: {
      title: 'CONTEXT',
      content: formatContext(input.context),
      required: false
    }
  }
}

/**
 * 格式化上下文信息
 */
function formatContext(context?: DelegationProtocolInput['context']): string {
  if (!context) return 'No additional context provided'

  const parts: string[] = []

  if (context.filePaths?.length) {
    parts.push(`**Files**: ${context.filePaths.join(', ')}`)
  }

  if (context.existingPatterns?.length) {
    parts.push(`**Existing Patterns**:\n${context.existingPatterns.map(p => `- ${p}`).join('\n')}`)
  }

  if (context.constraints?.length) {
    parts.push(`**Constraints**:\n${context.constraints.map(c => `- ${c}`).join('\n')}`)
  }

  if (context.additionalInfo) {
    parts.push(`**Additional Info**: ${context.additionalInfo}`)
  }

  return parts.length > 0 ? parts.join('\n\n') : 'No additional context provided'
}

/**
 * 将委托协议序列化为 Prompt 文本
 */
export function serializeDelegationProtocol(protocol: DelegationProtocol): string {
  const sections: string[] = []

  const sectionOrder: (keyof DelegationProtocol)[] = [
    'task',
    'expectedOutcome',
    'requiredTools',
    'mustDo',
    'mustNotDo',
    'context'
  ]

  for (const key of sectionOrder) {
    const section = protocol[key]
    sections.push(`## ${section.title}\n\n${section.content}`)
  }

  return sections.join('\n\n---\n\n')
}

/**
 * 验证委托协议
 */
export function validateDelegationProtocol(input: DelegationProtocolInput): DelegationValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 必需字段验证
  if (!input.task?.trim()) {
    errors.push('Task description is required and cannot be empty')
  }

  if (!input.expectedOutcome?.trim()) {
    errors.push('Expected outcome is required and cannot be empty')
  }

  // 任务描述质量检查
  if (input.task && input.task.length < 20) {
    warnings.push('Task description seems too short. Consider adding more detail.')
  }

  // 模糊词汇检测
  const vagueTerms = ['etc', 'some', 'maybe', 'probably', 'might', 'should', 'could']
  for (const term of vagueTerms) {
    if (input.task?.toLowerCase().includes(term)) {
      warnings.push(`Task contains vague term "${term}". Be more specific.`)
    }
  }

  // MUST DO 检查
  if (!input.mustDo?.length) {
    warnings.push('No MUST DO requirements specified. Consider adding explicit requirements.')
  }

  // MUST NOT DO 检查
  if (!input.mustNotDo?.length) {
    warnings.push('No MUST NOT DO constraints specified. Consider adding explicit constraints.')
  }

  // 工具列表检查
  if (!input.requiredTools?.length) {
    warnings.push('No specific tools listed. Agent will use all available tools.')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * 创建快速委托（简化版本）
 */
export function createQuickDelegation(
  task: string,
  expectedOutcome: string,
  tools?: string[]
): string {
  const protocol = buildDelegationProtocol({
    task,
    expectedOutcome,
    requiredTools: tools
  })

  return serializeDelegationProtocol(protocol)
}

/**
 * 从 Prompt 中解析委托协议（反序列化）
 */
export function parseDelegationProtocol(prompt: string): DelegationProtocolInput | null {
  const sectionRegex = /## (TASK|EXPECTED OUTCOME|REQUIRED TOOLS|MUST DO|MUST NOT DO|CONTEXT)\n\n([\s\S]*?)(?=---|\n## |$)/g

  const result: DelegationProtocolInput = {
    task: '',
    expectedOutcome: ''
  }

  let match: RegExpExecArray | null
  while ((match = sectionRegex.exec(prompt)) !== null) {
    const [, sectionName, content] = match
    const trimmedContent = content.trim()

    switch (sectionName) {
      case 'TASK':
        result.task = trimmedContent
        break
      case 'EXPECTED OUTCOME':
        result.expectedOutcome = trimmedContent
        break
      case 'REQUIRED TOOLS':
        result.requiredTools = trimmedContent
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)
        break
      case 'MUST DO':
        result.mustDo = parseNumberedList(trimmedContent)
        break
      case 'MUST NOT DO':
        result.mustNotDo = parseNumberedList(trimmedContent)
        break
      case 'CONTEXT':
        result.context = { additionalInfo: trimmedContent }
        break
    }
  }

  if (!result.task || !result.expectedOutcome) {
    return null
  }

  return result
}

/**
 * 解析编号列表
 */
function parseNumberedList(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean)
}

/**
 * 委托协议模板集合
 */
export const DELEGATION_TEMPLATES = {
  /**
   * 代码探索模板
   */
  exploration: (query: string, scope: string): DelegationProtocolInput => ({
    task: `搜索并分析代码库中关于 "${query}" 的内容`,
    expectedOutcome: `提供相关文件列表、代码位置和简要说明，使用绝对路径`,
    requiredTools: ['glob', 'grep', 'read'],
    mustDo: [
      '返回所有匹配的文件路径（绝对路径）',
      '解释每个匹配的相关性',
      '提供可立即使用的结果'
    ],
    mustNotDo: ['使用相对路径', '创建或修改任何文件', '遗漏明显的匹配'],
    context: {
      constraints: [`搜索范围: ${scope}`]
    }
  }),

  /**
   * 代码实现模板
   */
  implementation: (
    task: string,
    files: string[],
    requirements: string[]
  ): DelegationProtocolInput => ({
    task: `实现: ${task}`,
    expectedOutcome: `完成代码实现，通过类型检查和基本测试`,
    requiredTools: ['read', 'write', 'edit', 'bash'],
    mustDo: [
      ...requirements,
      '遵循现有代码风格',
      '添加必要的错误处理',
      '运行 lsp_diagnostics 验证无类型错误'
    ],
    mustNotDo: [
      '使用 `as any` 或 `@ts-ignore`',
      '删除现有功能',
      '在修复 bug 时进行重构',
      '未经请求提交代码'
    ],
    context: {
      filePaths: files
    }
  }),

  /**
   * 咨询模板
   */
  consultation: (question: string, codeContext: string): DelegationProtocolInput => ({
    task: `提供关于以下问题的架构/技术建议: ${question}`,
    expectedOutcome: `简洁的建议，包含具体的行动步骤和工作量估计`,
    requiredTools: ['read', 'glob', 'grep'],
    mustDo: [
      '提供 2-3 句话的核心建议',
      '列出不超过 7 个编号步骤的行动计划',
      '标注工作量估计：Quick(<1h), Short(1-4h), Medium(1-2d), Large(3d+)'
    ],
    mustNotDo: [
      '超出请求范围提供建议',
      '建议添加新依赖（除非明确要求）',
      '提供冗长的分析（保持简洁）'
    ],
    context: {
      additionalInfo: codeContext
    }
  }),

  /**
   * 文档查找模板
   */
  documentation: (library: string, topic: string): DelegationProtocolInput => ({
    task: `查找 ${library} 关于 "${topic}" 的官方文档和最佳实践`,
    expectedOutcome: `提供官方文档链接、代码示例和关键要点`,
    requiredTools: ['webfetch', 'websearch', 'context7'],
    mustDo: [
      '优先使用官方文档',
      '提供可验证的链接',
      '包含代码示例',
      '注明文档版本（如适用）'
    ],
    mustNotDo: [
      '使用过时的信息',
      '编造 URL 或 API',
      '忽略版本差异'
    ],
    context: {
      constraints: [`当前年份: ${new Date().getFullYear()}`]
    }
  })
}
