/**
 * Unified Trace Contract
 *
 * Provides a single traceId that flows through the entire message→router→delegate/workforce
 * →run→task→event chain, enabling end-to-end request correlation.
 *
 * Design principles:
 * - traceId is generated at the message entry point (IPC handler)
 * - traceId propagates through all downstream service calls
 * - traceId is written to task/run metadata for persistence
 * - traceId is included in streaming events for frontend correlation
 */

export interface TraceContext {
  traceId: string
  parentSpanId?: string
  spanId?: string
  sessionId?: string
  messageId?: string
  startedAt: string
}

let traceCounter = 0

export function generateTraceId(prefix = 'tr'): string {
  const timestamp = Date.now().toString(36)
  const counter = (traceCounter++).toString(36).padStart(4, '0')
  const random = Math.random().toString(36).slice(2, 6)
  return `${prefix}-${timestamp}-${counter}-${random}`
}

export function generateSpanId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function createTraceContext(options?: {
  sessionId?: string
  messageId?: string
  parentTraceId?: string
}): TraceContext {
  return {
    traceId: options?.parentTraceId || generateTraceId(),
    spanId: generateSpanId(),
    sessionId: options?.sessionId,
    messageId: options?.messageId,
    startedAt: new Date().toISOString()
  }
}

export function deriveChildSpan(parent: TraceContext): TraceContext {
  return {
    ...parent,
    parentSpanId: parent.spanId,
    spanId: generateSpanId(),
    startedAt: new Date().toISOString()
  }
}

export interface TraceMetadata {
  traceId: string
  spanId?: string
  parentSpanId?: string
}

export function extractTraceMetadata(context: TraceContext): TraceMetadata {
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId
  }
}

export function applyTraceMetadata(
  metadata: Record<string, unknown> = {},
  context?: TraceContext
): Record<string, unknown> {
  if (!context?.traceId) {
    return metadata
  }

  return {
    ...metadata,
    traceId: context.traceId,
    trace: extractTraceMetadata(context)
  }
}
