import { describe, expect, it } from 'vitest'
import { extractRouteOutput } from '@/main/ipc/handlers/route-output'

describe('extractRouteOutput', () => {
  it('sanitizes delegate output for user-facing messages', () => {
    const result = extractRouteOutput({
      taskId: 'task-1',
      output: [
        'Running validation (typecheck/build)',
        'assistant to=functions.bash',
        '{"command":"npm run build","timeout":600000}',
        'Validation passed.'
      ].join('\n'),
      success: true
    } as any)

    expect(result).toContain('Running validation (typecheck/build)')
    expect(result).toContain('Validation passed.')
    expect(result).not.toContain('assistant to=functions.bash')
    expect(result).not.toContain('"command"')
  })

  it('sanitizes workflow task outputs in user-facing summary', () => {
    const result = extractRouteOutput({
      workflowId: 'workflow-1',
      tasks: [{ id: 'task-1', description: 'run build', dependencies: [] }],
      results: new Map([
        [
          'task-1',
          [
            'Running validation (typecheck/build)',
            'assistant to=functions.bash',
            '{"command":"npm run build","timeout":600000}',
            'Validation passed.'
          ].join('\n')
        ]
      ]),
      executions: new Map(),
      success: true,
      sharedContextStore: {
        workflowId: 'workflow-1',
        entries: [],
        archivedEntries: [],
        retentionLimit: 50
      }
    } as any)

    expect(result).toContain('Running validation (typecheck/build)')
    expect(result).toContain('Validation passed.')
    expect(result).not.toContain('assistant to=functions.bash')
    expect(result).not.toContain('"command"')
  })
})
