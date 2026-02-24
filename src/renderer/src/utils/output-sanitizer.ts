const WRAPPER_LINE_PATTERNS: RegExp[] = [
  /^assistant\s+to=functions\.[\w.-]+\b/i,
  /^assistant\s+to=multi_tool_use\.parallel\b/i,
  /^to=functions\.[\w.-]+\b/i,
  /^to=multi_tool_use\.parallel\b/i,
  /^commentary\b/i,
  /^recipient_name\b/i,
  /^parameters\b/i,
  /^run_in_background\b/i,
  /^timeout\b/i,
  /^description\b/i,
  /^command\b/i,
  /^cwd\b/i,
  /^tool_use_error\b/i,
  /^inputvalidationerror\b/i,
  /^persisted-output\b/i,
  /^use\s+read\s+to\s+view\b/i
]

function containsWrapperSignal(text: string): boolean {
  const normalized = text.toLowerCase()
  return (
    normalized.includes('assistant to=functions.') ||
    normalized.includes('assistant to=multi_tool_use.parallel') ||
    normalized.includes('to=functions.') ||
    normalized.includes('recipient_name') ||
    normalized.includes('inputvalidationerror') ||
    normalized.includes('tool_use_error')
  )
}

function isLikelyToolPayloadJsonLine(trimmed: string): boolean {
  if (!/^\{.*\}$/.test(trimmed)) {
    return false
  }

  return /"(command|recipient_name|parameters|timeout|description|cwd|run_in_background|tool_uses?)"\s*:/.test(
    trimmed
  )
}

function shouldDropLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (WRAPPER_LINE_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return true
  }
  return isLikelyToolPayloadJsonLine(trimmed)
}

export function sanitizeDisplayOutput(raw: string): string {
  if (!raw) return ''

  const normalized = raw.replace(/\r\n?/g, '\n')
  if (!containsWrapperSignal(normalized)) {
    return normalized.trim()
  }

  const kept: string[] = []
  for (const line of normalized.split('\n')) {
    if (shouldDropLine(line)) {
      continue
    }
    if (containsWrapperSignal(line)) {
      continue
    }
    kept.push(line)
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
