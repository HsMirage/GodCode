/**
 * GodCode Skill System
 *
 * Skills extend agent capabilities with predefined prompts, tools, and behaviors.
 *
 * @example
 * ```typescript
 * import { skillRegistry, initializeSkills } from '@/main/services/skills'
 *
 * // Initialize skill system
 * await initializeSkills({
 *   workspaceDir: '/path/to/workspace'
 * })
 *
 * // Get a skill by ID
 * const gitSkill = skillRegistry.get('git-master')
 *
 * // Find skills matching user input
 * const matchingSkills = skillRegistry.findByInput('help me commit these changes')
 *
 * // Find skill by command
 * const commitSkill = skillRegistry.findByCommand('/commit')
 * ```
 */

// Types
export type {
  Skill,
  SkillTrigger,
  SkillMetadata,
  SkillMcpConfig,
  SkillCommandItem,
  SkillContext,
  SkillResult,
  SkillSource,
  SkillRegistration
} from './types'

// Registry
export { skillRegistry } from './registry'

// Loader
export {
  loadBuiltinSkills,
  loadSkillsFromDirectory,
  loadUserSkills,
  loadWorkspaceSkills,
  initializeSkills,
  reloadSkills,
  type SkillLoaderOptions
} from './loader'

// Builtin skills
export { gitMasterSkill, frontendUiUxSkill, reviewSkill, fixSkill, explainSkill } from './builtin'
