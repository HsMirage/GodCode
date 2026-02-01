import { Tool } from './tool.interface'

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map()

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  list(): Tool[] {
    return Array.from(this.tools.values())
  }

  listByCategory(category: string): Tool[] {
    return this.list().filter(t => t.definition.category === category)
  }
}

export const toolRegistry = new ToolRegistry()
