import { describe, expect, it } from 'vitest'
import { sanitizeDisplayOutput } from '../../../src/renderer/src/utils/output-sanitizer'

describe('sanitizeDisplayOutput', () => {
  it('removes tool-wrapper fragments from displayed output', () => {
    const input = [
      'Running validation (typecheck/build)',
      'assistant to=functions.bash',
      '{"command":"npm run build","timeout":600000}',
      'Validation passed.'
    ].join('\n')

    const output = sanitizeDisplayOutput(input)

    expect(output).toContain('Running validation (typecheck/build)')
    expect(output).toContain('Validation passed.')
    expect(output).not.toContain('assistant to=functions.bash')
    expect(output).not.toContain('"command"')
  })

  it('preserves multilingual narrative text', () => {
    const input = '修复完成。\nEverything is clean now.'
    expect(sanitizeDisplayOutput(input)).toBe(input)
  })

  it('keeps narrative lines containing recipient_name and command words', () => {
    const input = [
      '排查记录：recipient_name 是日志字段名。',
      '这个 command 不是工具调用，只是自然语言描述。'
    ].join('\n')

    const output = sanitizeDisplayOutput(input)

    expect(output).toContain('recipient_name 是日志字段名')
    expect(output).toContain('这个 command 不是工具调用')
  })
})
