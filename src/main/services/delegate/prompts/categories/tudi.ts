import type { CategoryPromptTemplate } from '../types'

export const tudi: CategoryPromptTemplate = {
  categoryCode: 'tudi',
  promptAppend: `<Category_Context>
You are working on tasks that don't fit specific categories but require moderate effort.

<Selection_Gate>
BEFORE selecting this category, VERIFY ALL conditions:
1. Task does NOT fit: tianbing (trivial), zhinv (UI), guigu (deep logic), maliang (creative), cangjie (docs)
2. Task requires more than trivial effort but is NOT system-wide
3. Scope is contained within a few files/modules

If task fits ANY other category, DO NOT select tudi.
This is NOT a default choice - it's for genuinely unclassifiable moderate-effort work.
</Selection_Gate>
</Category_Context>

<Caller_Warning>
THIS CATEGORY USES A GENERAL LOW-TO-MID COMPLEXITY MODEL PROFILE.

Provide clear structure in delegation prompts:
1. MUST DO: Enumerate required actions explicitly
2. MUST NOT DO: State forbidden actions to prevent scope creep
3. EXPECTED OUTPUT: Define concrete success criteria

Do not pass ambiguous, under-specified prompts to this category.
</Caller_Warning>`,
  description: '土地(TuDi) - 中等难度/常规任务',
  version: '1.1.0'
}
