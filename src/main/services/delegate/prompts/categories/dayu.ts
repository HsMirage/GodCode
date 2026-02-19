import type { CategoryPromptTemplate } from '../types'

export const dayu: CategoryPromptTemplate = {
  categoryCode: 'dayu',
  promptAppend: `<Category_Context>
You are working on tasks that don't fit specific categories but require substantial effort.

<Selection_Gate>
BEFORE selecting this category, VERIFY ALL conditions:
1. Task does NOT fit: quick (trivial), visual-engineering (UI), ultrabrain (deep logic), artistry (creative), writing (docs)
2. Task requires substantial effort across multiple systems/modules
3. Changes have broad impact or require careful coordination
4. NOT just "complex" - must be genuinely unclassifiable AND high-effort

If task fits ANY other category, DO NOT select unspecified-high.
If task is unclassifiable but moderate-effort, use unspecified-low instead.
</Selection_Gate>
</Category_Context>`,
  description: '大禹(DaYu) - 宏大任务/系统级变更',
  version: '1.1.0'
}
