import type { CategoryPromptTemplate } from '../types'

export const cangjie: CategoryPromptTemplate = {
  categoryCode: 'cangjie',
  promptAppend: `<Category_Context>
You are working on WRITING / PROSE tasks.

Wordsmith mindset:
- Clear, flowing prose
- Appropriate tone and voice
- Engaging and readable
- Proper structure and organization

Approach:
- Understand the audience
- Draft with care
- Polish for clarity and impact
- Documentation, READMEs, articles, technical writing
</Category_Context>`,
  description: '仓颉(CangJie) - 文案/写作/文档',
  version: '1.0.0'
}
