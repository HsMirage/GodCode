export function getLastPathSegment(inputPath: string): string {
  const trimmed = inputPath.replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

