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
