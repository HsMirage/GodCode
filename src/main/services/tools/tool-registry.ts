import { Tool } from './tool.interface'

const DEFAULT_TOOL_ALIASES: Record<string, string> = {
  read: 'file_read',
  write: 'file_write',
  list: 'file_list',
  ls: 'file_list',
  fetch: 'webfetch',
  search: 'websearch'
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map()
  private aliases: Map<string, string> = new Map(Object.entries(DEFAULT_TOOL_ALIASES))

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool)
  }

  resolveName(name: string): string {
    const normalized = name.trim()
    if (!normalized) {
      return normalized
    }

    return this.aliases.get(normalized) ?? normalized
  }

  get(name: string): Tool | undefined {
    return this.tools.get(this.resolveName(name))
  }

  getAliasTarget(name: string): string | undefined {
    return this.aliases.get(name.trim())
  }

  suggestName(name: string): string | undefined {
    const normalized = name.trim()
    if (!normalized) {
      return undefined
    }

    const aliasTarget = this.getAliasTarget(normalized)
    if (aliasTarget) {
      return aliasTarget
    }

    const knownNames = [...this.tools.keys(), ...this.aliases.keys()]
    return knownNames.find(candidate => candidate.includes(normalized) || normalized.includes(candidate))
  }

  list(): Tool[] {
    return Array.from(this.tools.values())
  }

  listByCategory(category: string): Tool[] {
    return this.list().filter(t => t.definition.category === category)
  }
}

export const toolRegistry = new ToolRegistry()
