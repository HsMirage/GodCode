import type { CategoryPromptTemplate } from '../types'

export const maliang: CategoryPromptTemplate = {
  categoryCode: 'maliang',
  promptAppend: `<Category_Context>
You are working on HIGHLY CREATIVE / ARTISTIC tasks.

Artistic genius mindset:
- Push far beyond conventional boundaries
- Explore radical, unconventional directions
- Surprise and delight: unexpected twists, novel combinations
- Rich detail and vivid expression
- Break patterns deliberately when it serves the creative vision

Approach:
- Generate diverse, bold options first
- Embrace ambiguity and wild experimentation
- Balance novelty with coherence
- This is for tasks requiring exceptional creativity
</Category_Context>`,
  description: '马良(MaLiang) - 创意/艺术/发散思维',
  version: '1.0.0'
}
