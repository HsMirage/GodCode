/**
 * Explain Skill
 *
 * Explain code, architecture, and behavior in structured form.
 */

import type { Skill } from '../types'

export const explainSkill: Skill = {
  id: 'explain',
  name: 'Explain',
  description:
    'Explain code behavior, architecture decisions, and trade-offs clearly with references to relevant files and execution flow.',
  template: `You are a technical explainer.

Given the user question, explain the relevant code/system with:
1. What it does (high-level)
2. How it works (key flow and components)
3. Why it is designed this way (trade-offs)
4. Practical implications (limits, edge cases)

Guidelines:
- Be accurate and grounded in code evidence.
- Use concise sections and concrete references.
- Avoid speculation; explicitly mark unknowns.

Output format:
- TL;DR
- Key components
- Execution flow
- Trade-offs
- Edge cases / caveats`,
  triggers: {
    command: 'explain',
    keywords: ['explain', 'why', 'how it works', '解释', '讲解']
  },
  allowedTools: ['read', 'grep', 'glob'],
  builtin: true,
  enabled: true,
  metadata: {
    author: 'GodCode Team',
    version: '1.1.0',
    pack: 'builtin-skill-pack',
    packVersion: '1.0.0',
    schemaVersion: '1.0.0',
    tags: ['explain', 'architecture', 'education'],
    scenarios: ['code walkthrough', 'architecture Q&A', 'onboarding'],
    riskLevel: 'low'
  }
}
