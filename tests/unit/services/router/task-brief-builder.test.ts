import { describe, expect, it } from 'vitest'
import { buildStructuredTaskBrief } from '@/main/services/router/task-brief-builder'

describe('buildStructuredTaskBrief', () => {
  it('builds a structured brief for complex implementation work', () => {
    const brief = buildStructuredTaskBrief({
      rawInput:
        '请跨模块重构消息链路，只修改 src/main/ipc/handlers/message.ts 和 src/main/services/message/message-execution.service.ts，验收标准\n- pnpm typecheck\n- 消息发送链路保持可用',
      strategy: 'workforce',
      complexityScore: 0.82
    })

    expect(brief).not.toBeNull()
    expect(brief?.inputFiles).toContain('src/main/ipc/handlers/message.ts')
    expect(brief?.allowedModificationScope[0]).toContain('src/main/ipc/handlers/message.ts')
    expect(brief?.acceptanceCriteria).toContain('pnpm typecheck')
  })

  it('skips simple direct tasks', () => {
    const brief = buildStructuredTaskBrief({
      rawInput: '翻译这段文字',
      strategy: 'direct',
      complexityScore: 0.2
    })

    expect(brief).toBeNull()
  })

  it('uses task template defaults when explicit acceptance is absent', () => {
    const brief = buildStructuredTaskBrief({
      rawInput: '请修复登录 bug，相关文件 src/main/auth.ts',
      strategy: 'delegate',
      complexityScore: 0.58,
      taskTemplate: {
        key: 'bug_fix',
        label: 'Bug 修复任务',
        acceptanceCriteria: ['问题可稳定复现并被修复。', '至少执行 1 条相关验证命令。']
      }
    })

    expect(brief?.templateKey).toBe('bug_fix')
    expect(brief?.templateLabel).toBe('Bug 修复任务')
    expect(brief?.acceptanceCriteria).toContain('问题可稳定复现并被修复。')
  })
})
