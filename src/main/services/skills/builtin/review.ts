/**
 * Review Skill
 *
 * Structured code review workflow for changed code.
 */

import type { Skill } from '../types'

export const reviewSkill: Skill = {
  id: 'review',
  name: 'Review',
  description:
    'Review current changes for correctness, regressions, and maintainability. Use when you need focused review feedback with concrete findings and test checks.',
  template: `You are a senior reviewer. Review the current code changes in this workspace.

Goals:
1. Identify correctness issues and regressions.
2. Identify security and reliability risks.
3. Highlight maintainability concerns and missing tests.
4. Provide a concise prioritized findings list.

Output format:
- Summary (1-3 bullets)
- Findings (severity: high/medium/low, file, reason, fix suggestion)
- Verification checklist (what to test)
- Final recommendation (approve / needs changes)

Be specific, actionable, and concise.`,
  triggers: {
    command: 'review',
    keywords: ['review', 'code review', 'pr review', '检查代码', '审查']
  },
  allowedTools: ['read', 'grep', 'glob', 'bash'],
  builtin: true,
  enabled: true,
  metadata: {
    author: 'CodeAll Team',
    version: '1.1.0',
    pack: 'builtin-skill-pack',
    packVersion: '1.0.0',
    schemaVersion: '1.0.0',
    tags: ['review', 'quality', 'testing'],
    scenarios: ['pre-commit review', 'pre-pr review', 'regression triage'],
    riskLevel: 'low'
  }
}
