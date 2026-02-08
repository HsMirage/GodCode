import type { CategoryPromptTemplate } from '../types'

export const zhinv: CategoryPromptTemplate = {
  categoryCode: 'zhinv',
  promptAppend: `<Category_Context>
You are working on VISUAL/UI tasks.

Design-first mindset:
- Bold aesthetic choices over safe defaults
- Unexpected layouts, asymmetry, grid-breaking elements
- Distinctive typography (avoid: Arial, Inter, Roboto, Space Grotesk)
- Cohesive color palettes with sharp accents
- High-impact animations with staggered reveals
- Atmosphere: gradient meshes, noise textures, layered transparencies

AVOID: Generic fonts, purple gradients on white, predictable layouts, cookie-cutter patterns.
</Category_Context>`,
  description: '织女(ZhiNv) - 前端/UI/UX、设计、样式、动画',
  version: '1.0.0'
}
