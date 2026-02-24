import type { CategoryPromptTemplate } from '../types'

export const dayu: CategoryPromptTemplate = {
  categoryCode: 'dayu',
  promptAppend: `<Category_Context>
You are working on tasks that don't fit specific categories but require substantial effort.

<Selection_Gate>
BEFORE selecting this category, VERIFY ALL conditions:
1. Task does NOT fit: tianbing (trivial), zhinv (UI), guigu (deep logic), maliang (creative), cangjie (docs)
2. Task requires substantial effort across multiple systems/modules
3. Changes have broad impact or require careful coordination
4. NOT just "complex" - must be genuinely unclassifiable AND high-effort

If task fits ANY other category, DO NOT select dayu.
If task is unclassifiable but moderate-effort, use tudi instead.
</Selection_Gate>
</Category_Context>`,
  description: '大禹(DaYu) - 宏大任务/系统级变更',
  version: '1.1.0'
}
