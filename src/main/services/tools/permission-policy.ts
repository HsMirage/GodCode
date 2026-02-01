export class PermissionPolicy {
  private allowList: Set<string> = new Set()
  private denyList: Set<string> = new Set()

  allow(toolName: string): void {
    this.allowList.add(toolName)
    this.denyList.delete(toolName)
  }

  deny(toolName: string): void {
    this.denyList.add(toolName)
    this.allowList.delete(toolName)
  }

  isAllowed(toolName: string): boolean {
    if (this.denyList.has(toolName)) return false
    if (this.allowList.size === 0) return true // 默认允许
    return this.allowList.has(toolName)
  }
}

export const defaultPolicy = new PermissionPolicy()
