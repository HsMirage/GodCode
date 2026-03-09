/**
 * Copyright (c) 2026 GodCode Team
 * SPDX-License-Identifier: MIT
 *
 * Category 注册表 — 从共享 agent-definitions 构建 category 运行时配置
 */

import { CATEGORY_DEFINITIONS } from '../../../shared/agent-definitions'
import { zhinv, cangjie, tianbing, guigu, maliang, guixu, tudi, dayu } from './prompts/categories'
import type { CategoryPromptTemplate } from './prompts/types'

export interface CategoryConfig {
  temperature: number
  promptTemplate?: CategoryPromptTemplate
}

// All prompt templates - build map automatically from categoryCode
const ALL_CATEGORY_PROMPTS: CategoryPromptTemplate[] = [
  zhinv,
  cangjie,
  tianbing,
  guigu,
  maliang,
  guixu,
  tudi,
  dayu
]

// Auto-build CATEGORY_PROMPT_MAP from categoryCode field
const CATEGORY_PROMPT_MAP: Record<string, CategoryPromptTemplate> = Object.fromEntries(
  ALL_CATEGORY_PROMPTS.map(p => [p.categoryCode, p])
)

const categoriesRegistry = CATEGORY_DEFINITIONS.reduce(
  (acc, def) => {
    const config: CategoryConfig = {
      temperature: def.defaultTemperature,
      promptTemplate: CATEGORY_PROMPT_MAP[def.code]
    }
    acc[def.code] = config
    return acc
  },
  {} as Record<string, CategoryConfig>
)

export const categories = categoriesRegistry

export function getCategoryPromptByCode(code: string): string | undefined {
  return categories[code]?.promptTemplate?.promptAppend
}
