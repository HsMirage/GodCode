import type { CategoryPromptTemplate } from '../types'

export const tianbing: CategoryPromptTemplate = {
  categoryCode: 'tianbing',
  promptAppend: `<Category_Context>
You are working on SMALL / QUICK tasks.

Efficient execution mindset:
- Fast, focused, minimal overhead
- Get to the point immediately
- No over-engineering
- Simple solutions for simple problems

Approach:
- Minimal viable implementation
- Skip unnecessary abstractions
- Direct and concise
</Category_Context>

<Caller_Warning>
THIS CATEGORY USUALLY RUNS A COST-OPTIMIZED LIGHTWEIGHT MODEL PROFILE.

Prompts for this category MUST be exhaustively explicit:
1. MUST DO: List required actions as atomic numbered steps
2. MUST NOT DO: Explicitly forbid likely mistakes and deviations
3. EXPECTED OUTPUT: Define exact success criteria and deliverables

Why this matters:
- Lightweight models drift without clear guardrails
- Vague instructions produce unstable output
- Implicit expectations are often missed

Mandatory prompt skeleton:

TASK: [one-sentence goal]

MUST DO:
1. [specific action with concrete details]
2. [next action]

MUST NOT DO:
- [forbidden action + reason]

EXPECTED OUTPUT:
- [exact deliverable]
- [verification criteria]

If this structure is missing, rewrite the prompt before delegating.
</Caller_Warning>`,
  description: '天兵(TianBing) - 快速任务/小修改',
  version: '1.1.0'
}
