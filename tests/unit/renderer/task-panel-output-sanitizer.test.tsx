import { describe, expect, it } from 'vitest'
import { sanitizeDisplayOutput } from '../../../src/renderer/src/utils/output-sanitizer'

describe('task panel output sanitizer', () => {
  it('sanitizes garbled wrapper artifacts from task output text', () => {
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
})
