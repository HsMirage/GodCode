# Learnings - Unit Tests for MVP2 Core Services

## Test Patterns

- **Mocking Strategy**: Using `vi.mock` with factory functions allows for clean dependency injection. Mocking the database service singleton via `DatabaseService.getInstance()` returning a mock client is effective.
- **Service Isolation**: Testing services in isolation (DelegateEngine, WorkforceEngine, SmartRouter) by mocking their dependencies (Database, LLMAdapter, other Engines) ensures tests are fast and deterministic.
- **Regex Testing**: When testing logic that depends on regex matching (like SmartRouter), using clear input strings that strongly match the intended pattern is crucial to avoid ambiguity and fragile tests.

## Gotchas

- **Regex Ambiguity**: The `SmartRouter` used regexes like `/前端/` which wouldn't match English strings like "Optimize React component" correctly if the regex expected Chinese characters or specific keywords not present in the input. Ensure test inputs explicitly match the regex definitions.
- **Default Fallbacks**: The router has a catch-all `/.*/` regex that defaults to 'delegate'/'quick'. If a specific rule isn't matched, this default triggers. Tests must be aware of this fallback behavior.
- **Equality Assertions**: `toBe` uses `Object.is` equality. When comparing Error messages, be careful. An error thrown as `new Error('msg')` might need to be checked against its message property or using string matching if the error is converted to a string. The initial test expected `'Error: API Error'` but got `'API Error'` because of how the error was propagated/mocked.

## Improvements

- **Explicit Test Data**: Use test data that clearly triggers the logic under test (e.g., using Chinese characters for Chinese regexes).
- **Mock Resetting**: `beforeEach(() => vi.clearAllMocks())` is essential to prevent state leakage between tests, especially when verifying call counts.

## Integration Tests Summary (Task 10.3.2)

### Current State
- **11 integration test files** in `tests/integration/`:
  1. `agent-workflow.test.ts` - 6 tests for session/message/agent flow
  2. `data-persistence.test.ts` - 12 tests for DB operations, audit, backup/restore
  3. `llm-providers.test.ts` - 10 tests for Anthropic/OpenAI/Gemini adapters
  4. `llm-adapters.test.ts` - 13 tests for adapter implementations
  5. `full-workflow.test.ts` - 7 tests for complete Space→Session→Task→Workforce flow
  6. `orchestration.test.ts` - 10 tests for DelegateEngine/WorkforceEngine
  7. `workforce-engine.test.ts` - 10 tests for task decomposition/coordination
  8. `browser-automation.test.ts` - 12 tests for browser view lifecycle
  9. `browser-tools.test.ts` - 17 tests for browser tool execution
  10. `ai-browser.test.ts` - 3 tests for AI browser integration
  11. `context-manager.test.ts` - 12 tests for context window management

- **120 total tests**, all passing

### Test Approach
- Most tests use in-memory mock stores (mimicking Prisma behavior)
- `full-workflow.test.ts` uses real embedded PostgreSQL for true integration
- External LLM APIs are mocked to avoid network dependencies

### Key Patterns
- `vi.hoisted()` for mock stores accessible before imports
- Mock Prisma delegates with CRUD operations
- Transaction support via `$transaction` mock
- Proper setup/teardown with `beforeEach`/`afterEach`
