import { describe, it, expect } from 'vitest'
import { AGENT_DEFINITIONS, CATEGORY_DEFINITIONS } from '@/shared/agent-definitions'
import {
  resolveAgentRuntimeToolNames,
  resolveCategoryRuntimeToolNames,
  resolveScopedRuntimeToolNames
} from '@/main/services/delegate/tool-allowlist'

const AVAILABLE_RUNTIME_TOOLS = new Set([
  'file_read',
  'file_list',
  'file_write',
  'grep',
  'glob',
  'bash',
  'webfetch',
  'websearch',
  'look_at',
  'browser_navigate',
  'browser_click',
  'browser_fill',
  'browser_snapshot',
  'browser_screenshot',
  'browser_extract',
  'lsp_diagnostics',
  'lsp_goto_definition',
  'lsp_find_references',
  'lsp_symbols'
])

describe('tool allowlist resolver', () => {
  it('resolves runtime tools for every canonical agent', () => {
    for (const agent of AGENT_DEFINITIONS) {
      const resolved = resolveAgentRuntimeToolNames(agent.code, AVAILABLE_RUNTIME_TOOLS)
      expect(resolved).toBeDefined()
      for (const toolName of resolved || []) {
        expect(AVAILABLE_RUNTIME_TOOLS.has(toolName)).toBe(true)
      }
    }
  })

  it('supports legacy OMO agent aliases', () => {
    expect(resolveAgentRuntimeToolNames('sisyphus', AVAILABLE_RUNTIME_TOOLS)).toEqual(
      resolveAgentRuntimeToolNames('haotian', AVAILABLE_RUNTIME_TOOLS)
    )
    expect(resolveAgentRuntimeToolNames('atlas', AVAILABLE_RUNTIME_TOOLS)).toEqual(
      resolveAgentRuntimeToolNames('kuafu', AVAILABLE_RUNTIME_TOOLS)
    )
    expect(resolveAgentRuntimeToolNames('explore', AVAILABLE_RUNTIME_TOOLS)).toEqual(
      resolveAgentRuntimeToolNames('qianliyan', AVAILABLE_RUNTIME_TOOLS)
    )
  })

  it('keeps haotian and kuafu away from web/browser tools by default', () => {
    const haotianTools = resolveAgentRuntimeToolNames('haotian', AVAILABLE_RUNTIME_TOOLS) || []
    const kuafuTools = resolveAgentRuntimeToolNames('kuafu', AVAILABLE_RUNTIME_TOOLS) || []

    for (const tools of [haotianTools, kuafuTools]) {
      expect(tools).toContain('file_read')
      expect(tools).toContain('file_write')
      expect(tools).not.toContain('webfetch')
      expect(tools).not.toContain('websearch')
      expect(tools).not.toContain('browser_navigate')
    }
  })

  it('keeps browser automation only in luban profile', () => {
    const lubanTools = resolveAgentRuntimeToolNames('luban', AVAILABLE_RUNTIME_TOOLS) || []
    const baizeTools = resolveAgentRuntimeToolNames('baize', AVAILABLE_RUNTIME_TOOLS) || []

    expect(lubanTools).toContain('browser_navigate')
    expect(lubanTools).toContain('browser_click')
    expect(baizeTools).not.toContain('browser_navigate')
  })

  it('resolves runtime tools for every category and alias', () => {
    for (const category of CATEGORY_DEFINITIONS) {
      const tools = resolveCategoryRuntimeToolNames(category.code, AVAILABLE_RUNTIME_TOOLS)
      expect(tools).toBeDefined()
      for (const toolName of tools || []) {
        expect(AVAILABLE_RUNTIME_TOOLS.has(toolName)).toBe(true)
      }
      expect(tools || []).not.toContain('browser_navigate')
    }

    expect(resolveCategoryRuntimeToolNames('visual-engineering', AVAILABLE_RUNTIME_TOOLS)).toEqual(
      resolveCategoryRuntimeToolNames('zhinv', AVAILABLE_RUNTIME_TOOLS)
    )
    expect(resolveCategoryRuntimeToolNames('unspecified-high', AVAILABLE_RUNTIME_TOOLS)).toEqual(
      resolveCategoryRuntimeToolNames('dayu', AVAILABLE_RUNTIME_TOOLS)
    )
  })

  it('prefers explicit availableTools, then subagent, then category', () => {
    expect(
      resolveScopedRuntimeToolNames(
        { availableTools: ['read', 'websearch'], subagentType: 'haotian', category: 'dayu' },
        AVAILABLE_RUNTIME_TOOLS
      )
    ).toEqual(['file_read', 'websearch'])

    const ditingWithDayu = resolveScopedRuntimeToolNames(
      { subagentType: 'diting', category: 'dayu' },
      AVAILABLE_RUNTIME_TOOLS
    )
    expect(ditingWithDayu).toContain('webfetch')
    expect(ditingWithDayu).not.toContain('file_write')

    const dayuOnly = resolveScopedRuntimeToolNames(
      { category: 'dayu' },
      AVAILABLE_RUNTIME_TOOLS
    )
    expect(dayuOnly).toContain('file_write')
    expect(dayuOnly).not.toContain('websearch')
  })
})

