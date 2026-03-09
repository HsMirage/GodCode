import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizeDecomposedSubtasks,
  parsePlanSubtasksFromContent,
  extractPlanPathFromInput,
  normalizePlanPath,
  shouldPreferPlanExecution,
  extractMarkdownPathCandidates,
  shouldRequireReferencedFiles,
  extractDependencyIds,
  extractTaskExecutionHint
} from '@/main/services/workforce/workflow-decomposer'
import {
  PHASE_ORDER,
  isValidPhaseDependency,
  resolveCanonicalSubagent,
  resolveCanonicalCategory,
  isPrimaryOrchestrator
} from '@/main/services/workforce/workflow-types'

describe('workflow-decomposer', () => {
  describe('parsePlanSubtasksFromContent', () => {
    it('parses unchecked markdown checkboxes as subtasks', () => {
      const content = `# Plan
- [x] Already done task
- [ ] First pending task
- [ ] Second pending task
`
      const subtasks = parsePlanSubtasksFromContent(content)
      expect(subtasks).toHaveLength(2)
      expect(subtasks[0].id).toBe('plan-1')
      expect(subtasks[0].description).toBe('First pending task')
      expect(subtasks[1].id).toBe('plan-2')
      expect(subtasks[1].description).toBe('Second pending task')
    })

    it('chains tasks sequentially when no explicit dependencies', () => {
      const content = `- [ ] Task A
- [ ] Task B
- [ ] Task C
`
      const subtasks = parsePlanSubtasksFromContent(content)
      expect(subtasks[0].dependencies).toEqual([])
      expect(subtasks[1].dependencies).toEqual(['plan-1'])
      expect(subtasks[2].dependencies).toEqual(['plan-2'])
    })

    it('respects explicit dependency declarations', () => {
      const content = `- [ ] Task 1: Setup
- [ ] Task 2: Implementation (depends on: 1)
- [ ] Task 3: Testing (depends on: 1, 2)
`
      const subtasks = parsePlanSubtasksFromContent(content)
      expect(subtasks[0].dependencies).toEqual([])
      expect(subtasks[1].dependencies).toEqual(['plan-1'])
      expect(subtasks[2].dependencies).toEqual(['plan-1', 'plan-2'])
    })

    it('extracts agent/category hints from task descriptions', () => {
      const content = `- [ ] 由 qianliyan 扫描代码库
- [ ] category: dayu 实现后端接口
`
      const subtasks = parsePlanSubtasksFromContent(content)
      expect(subtasks[0].assignedAgent).toBe('qianliyan')
      expect(subtasks[1].assignedCategory).toBe('dayu')
    })

    it('marks all parsed tasks with source=plan', () => {
      const content = `- [ ] Something
- [ ] Another thing
`
      const subtasks = parsePlanSubtasksFromContent(content)
      expect(subtasks.every(t => t.source === 'plan')).toBe(true)
    })

    it('skips completed (checked) items', () => {
      const content = `- [x] Done
- [X] Also done
- [ ] Still pending
`
      const subtasks = parsePlanSubtasksFromContent(content)
      expect(subtasks).toHaveLength(1)
      expect(subtasks[0].description).toBe('Still pending')
    })

    it('handles explicit Task IDs in description', () => {
      const content = `- [ ] Task 3.1: Database migration
- [ ] Task 3.2: API endpoint (depends on: 3.1)
`
      const subtasks = parsePlanSubtasksFromContent(content)
      expect(subtasks[0].id).toBe('plan-3.1')
      expect(subtasks[1].id).toBe('plan-3.2')
      expect(subtasks[1].dependencies).toEqual(['plan-3.1'])
    })
  })

  describe('normalizeDecomposedSubtasks', () => {
    it('normalizes valid subtask array', () => {
      const input = [
        { id: 'task-1', description: 'Explore codebase', dependencies: [], subagent_type: 'qianliyan' },
        { id: 'task-2', description: 'Implement feature', dependencies: ['task-1'], category: 'dayu' }
      ]
      const result = normalizeDecomposedSubtasks(input)
      expect(result).toHaveLength(2)
      expect(result[0].assignedAgent).toBe('qianliyan')
      expect(result[0].assignedCategory).toBeUndefined()
      expect(result[1].assignedCategory).toBe('dayu')
      expect(result[1].assignedAgent).toBeUndefined()
    })

    it('returns empty array for non-array input', () => {
      expect(normalizeDecomposedSubtasks(null)).toEqual([])
      expect(normalizeDecomposedSubtasks(undefined)).toEqual([])
      expect(normalizeDecomposedSubtasks('string')).toEqual([])
    })

    it('generates fallback IDs when missing', () => {
      const input = [
        { description: 'No ID task', dependencies: [] }
      ]
      const result = normalizeDecomposedSubtasks(input)
      expect(result[0].id).toBe('task-1')
    })

    it('deduplicates dependencies', () => {
      const input = [
        { id: 't', description: 'x', dependencies: ['a', 'a', 'b', 'b'] }
      ]
      const result = normalizeDecomposedSubtasks(input)
      expect(result[0].dependencies).toEqual(['a', 'b'])
    })

    it('rejects unknown agent/category codes', () => {
      const input = [
        { id: 't', description: 'x', dependencies: [], subagent_type: 'invalid-agent', category: 'invalid-cat' }
      ]
      const result = normalizeDecomposedSubtasks(input)
      expect(result[0].assignedAgent).toBeUndefined()
      expect(result[0].assignedCategory).toBeUndefined()
    })
  })

  describe('plan path helpers', () => {
    it('extractPlanPathFromInput finds .fuxi/plans paths', () => {
      expect(extractPlanPathFromInput('执行 .fuxi/plans/my-plan.md')).toBe('.fuxi/plans/my-plan.md')
    })

    it('extractPlanPathFromInput finds .sisyphus/plans paths', () => {
      expect(extractPlanPathFromInput('run .sisyphus/plans/test.md')).toBe('.sisyphus/plans/test.md')
    })

    it('extractPlanPathFromInput returns undefined when no plan path', () => {
      expect(extractPlanPathFromInput('just a normal message')).toBeUndefined()
    })

    it('normalizePlanPath resolves relative paths', () => {
      const result = normalizePlanPath('.fuxi/plans/test.md', '/workspace')
      expect(result).toContain('test.md')
      expect(result.startsWith('/')).toBe(true)
    })

    it('shouldPreferPlanExecution returns true for kuafu agent', () => {
      expect(shouldPreferPlanExecution('do something', 'kuafu')).toBe(true)
    })

    it('shouldPreferPlanExecution detects plan keywords', () => {
      expect(shouldPreferPlanExecution('执行计划')).toBe(true)
      expect(shouldPreferPlanExecution('run plan')).toBe(true)
      expect(shouldPreferPlanExecution('random request')).toBe(false)
    })
  })

  describe('markdown path helpers', () => {
    it('extracts markdown path candidates from input', () => {
      const candidates = extractMarkdownPathCandidates('参考 docs/plan.md 和 docs/spec.md')
      expect(candidates).toContain('docs/plan.md')
      expect(candidates).toContain('docs/spec.md')
    })

    it('deduplicates candidates', () => {
      const candidates = extractMarkdownPathCandidates('docs/a.md 和 docs/a.md')
      expect(candidates).toHaveLength(1)
    })

    it('filters out .sisyphus/plans paths', () => {
      const candidates = extractMarkdownPathCandidates('.sisyphus/plans/plan.md 和 docs/spec.md')
      expect(candidates).not.toContain('.sisyphus/plans/plan.md')
      expect(candidates).toContain('docs/spec.md')
    })

    it('shouldRequireReferencedFiles detects requirement keywords', () => {
      expect(shouldRequireReferencedFiles('根据 docs/spec.md 实现')).toBe(true)
      expect(shouldRequireReferencedFiles('based on docs/spec.md')).toBe(true)
      expect(shouldRequireReferencedFiles('just mention docs/spec.md')).toBe(false)
    })
  })

  describe('extractDependencyIds', () => {
    it('extracts dependency IDs from text with markers', () => {
      expect(extractDependencyIds('depends on: 1, 2')).toEqual(['1', '2'])
      expect(extractDependencyIds('依赖: task 3')).toEqual(['3'])
    })

    it('returns empty for text without dependency markers', () => {
      expect(extractDependencyIds('just a description')).toEqual([])
    })
  })

  describe('extractTaskExecutionHint', () => {
    it('extracts explicit subagent_type', () => {
      const result = extractTaskExecutionHint(['subagent_type: qianliyan'])
      expect(result.assignedAgent).toBe('qianliyan')
    })

    it('extracts explicit category', () => {
      const result = extractTaskExecutionHint(['category: dayu'])
      expect(result.assignedCategory).toBe('dayu')
    })

    it('detects inline agent names', () => {
      const result = extractTaskExecutionHint(['由 diting 汇总文档'])
      expect(result.assignedAgent).toBe('diting')
    })
  })
})

describe('workflow-types', () => {
  describe('PHASE_ORDER', () => {
    it('has correct phase sequence', () => {
      expect(PHASE_ORDER).toEqual(['discovery', 'plan-review', 'deep-review', 'execution'])
    })
  })

  describe('isValidPhaseDependency', () => {
    it('allows same-phase dependencies', () => {
      expect(isValidPhaseDependency('execution', 'execution')).toBe(true)
    })

    it('allows dependency on earlier phase', () => {
      expect(isValidPhaseDependency('execution', 'discovery')).toBe(true)
      expect(isValidPhaseDependency('plan-review', 'discovery')).toBe(true)
      expect(isValidPhaseDependency('deep-review', 'plan-review')).toBe(true)
    })

    it('rejects dependency on later phase', () => {
      expect(isValidPhaseDependency('discovery', 'execution')).toBe(false)
      expect(isValidPhaseDependency('plan-review', 'execution')).toBe(false)
    })
  })

  describe('resolveCanonicalSubagent', () => {
    it('resolves known subagent codes', () => {
      expect(resolveCanonicalSubagent('qianliyan')).toBe('qianliyan')
      expect(resolveCanonicalSubagent('DITING')).toBe('diting')
    })

    it('returns undefined for unknown codes', () => {
      expect(resolveCanonicalSubagent('unknown')).toBeUndefined()
      expect(resolveCanonicalSubagent(undefined)).toBeUndefined()
    })
  })

  describe('resolveCanonicalCategory', () => {
    it('resolves known category codes', () => {
      expect(resolveCanonicalCategory('dayu')).toBe('dayu')
      expect(resolveCanonicalCategory('ZHINV')).toBe('zhinv')
    })

    it('returns undefined for unknown codes', () => {
      expect(resolveCanonicalCategory('unknown')).toBeUndefined()
    })
  })

  describe('isPrimaryOrchestrator', () => {
    it('identifies primary orchestrators', () => {
      expect(isPrimaryOrchestrator('fuxi')).toBe(true)
      expect(isPrimaryOrchestrator('haotian')).toBe(true)
      expect(isPrimaryOrchestrator('kuafu')).toBe(true)
    })

    it('rejects non-orchestrators', () => {
      expect(isPrimaryOrchestrator('qianliyan')).toBe(false)
      expect(isPrimaryOrchestrator(undefined)).toBe(false)
    })
  })
})
