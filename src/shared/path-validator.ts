import path from 'path'

export class PathValidator {
  /**
   * Verifies if the target path is safe (inside root directory).
   * Necessary security check to prevent directory traversal attacks.
   */
  static isPathSafe(targetPath: string, rootDir: string): boolean {
    const normalizedTarget = path.resolve(rootDir, targetPath)
    const normalizedRoot = path.resolve(rootDir)
    return normalizedTarget.startsWith(normalizedRoot)
  }

  /**
   * Resolves a path and ensures it is safe, throwing error if not.
   * Necessary security check to prevent directory traversal attacks.
   */
  static resolveSafePath(targetPath: string, rootDir: string): string {
    const resolved = path.resolve(rootDir, targetPath)
    if (!this.isPathSafe(targetPath, rootDir)) {
      throw new Error(`Path traversal detected: ${targetPath}`)
    }
    return resolved
  }

  /**
   * Normalizes path separators for consistency.
   * Necessary for cross-platform compatibility.
   */
  static normalizePath(inputPath: string): string {
    return path.normalize(inputPath).replace(/\\/g, '/')
  }
}
