## Issues
- lsp_diagnostics for src/main/ipc/handlers/model.ts reported stale type errors (provider/apiKey mismatch) even after code and domain type updates.
- 2026-01-28: None.

## Task 8 Blocker: Schema Mismatch

**Problem**: The plan requires Artifact model with messageId, title, language fields, but the FROZEN prisma/schema.prisma only has:
- sessionId (not messageId)
- path (not title)  
- No language field

**Impact**: Cannot implement artifact extraction as specified without schema migration.

**Options**:
1. Use sessionId instead of messageId (loses message linkage)
2. Encode title+language in path field (hacky)
3. Skip Task 8 and document blocker
4. Request schema change (violates FROZEN rule)

**Decision**: Skipping Task 8 - requires architecture discussion with user about schema design.


## Task 11: Multi-LLM Adapters - DEFERRED

**Status**: Implementation pattern clear, but deferred due to:
1. Subagent consistently refusing valid full-stack tasks
2. Time constraints - each adapter needs careful SDK integration
3. Requires testing with real API keys for each provider

**Implementation Plan** (for next session):
- OpenAIAdapter: Use openai SDK, stream via chat.completions.create()
- GeminiAdapter: Use @google/generative-ai, handle 'model' role conversion
- OpenAICompatAdapter: Extend OpenAIAdapter with custom baseURL

**Dependencies Installed**: ✅ openai v6.16.0, @google/generative-ai v0.24.1

**Reference**: AnthropicAdapter provides complete pattern (201 lines)

