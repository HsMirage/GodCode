import { describe, expect, it } from 'vitest'
import { sanitizeCompletionOutput } from '@/main/services/workforce/output-sanitizer'

describe('sanitizeCompletionOutput', () => {
  it('removes tool-wrapper protocol lines while preserving meaningful summary text', () => {
    const input = [
      'Running validation (typecheck/build)',
      'assistant to=functions.bash',
      '{"command":"npm run build","timeout":600000}',
      '任务已完成，构建通过。'
    ].join('\n')

    const output = sanitizeCompletionOutput(input)

    expect(output).toContain('Running validation (typecheck/build)')
    expect(output).toContain('任务已完成，构建通过。')
    expect(output).not.toContain('assistant to=functions.bash')
    expect(output).not.toContain('"command"')
  })

  it('preserves multilingual narrative content', () => {
    const input = '已完成修复。\nEverything looks good.\n下一步可以运行回归测试。'
    const output = sanitizeCompletionOutput(input)

    expect(output).toBe(input)
  })

  it('produces deterministic equivalent output for equivalent wrapper noise', () => {
    const a = [
      'assistant to=functions.bash',
      '{"command":"npm run build"}',
      'Validation complete.'
    ].join('\n')
    const b = [
      'assistant to=multi_tool_use.parallel',
      'recipient_name: functions.bash',
      'parameters: {"command":"npm run build"}',
      'Validation complete.'
    ].join('\n')

    expect(sanitizeCompletionOutput(a)).toBe('Validation complete.')
    expect(sanitizeCompletionOutput(b)).toBe('Validation complete.')
    expect(sanitizeCompletionOutput(a)).toBe(sanitizeCompletionOutput(b))
  })

  it('keeps normal narrative lines that contain technical keywords', () => {
    const input = [
      '任务排查结论：',
      '日志提到 recipient_name 只是字段说明，不是工具协议片段。',
      '请继续查看 command 参数来源。'
    ].join('\n')

    const output = sanitizeCompletionOutput(input)

    expect(output).toContain('recipient_name 只是字段说明')
    expect(output).toContain('command 参数来源')
  })
})
