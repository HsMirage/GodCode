/**
 * Fix Skill
 *
 * Bug fixing workflow with root-cause-first approach.
 */

import type { Skill } from '../types'

export const fixSkill: Skill = {
  id: 'fix',
  name: 'Fix',
  description:
    'Investigate and fix a concrete bug or failing test with minimal, targeted changes and validation steps.',
  template: `You are a debugging-focused engineer.

Given the user issue, execute this workflow:
1. Reproduce the issue (or define a minimal reproduction).
2. Identify root cause from code evidence.
3. Propose the minimal safe fix.
4. Apply fix and verify with targeted tests/checks.
5. Summarize root cause + fix + verification output.

Constraints:
- Prefer smallest change set that resolves the issue.
- Do not add unrelated refactors.
- Preserve existing behavior outside the bug scope.

Output format:
- Reproduction
- Root cause
- Fix
- Verification
- Residual risk`,
  triggers: {
    command: 'fix',
    keywords: ['fix', 'bug', '修复', '报错', 'failing test']
  },
  allowedTools: ['read', 'write', 'grep', 'glob', 'bash'],
  builtin: true,
  enabled: true,
  metadata: {
    author: 'CodeAll Team',
    version: '1.1.0',
    pack: 'builtin-skill-pack',
    packVersion: '1.0.0',
    schemaVersion: '1.0.0',
    tags: ['bugfix', 'debugging', 'stability'],
    scenarios: ['runtime error fix', 'test failure fix', 'regression fix'],
    riskLevel: 'medium'
  }
}
