## Dynamic Truncator Testing Patterns
- Token estimation is roughly 4 characters per token.
- Truncation logic has two paths: character-based (when lines <= preserveHeaderLines) and line-based.
- Truncation message adds a fixed token cost (50 tokens) which must be accounted for in test expectations.
- Factory functions like createDynamicTruncator maintain internal state that should be verified after operations.
## Unit Testing
- Used `vi.useFakeTimers()` to test TTL expiration in `ProviderCacheService`.
- Mocked `Date.now()` behavior implicitly through Vitest timers.
- Verified that returning a `Set` from `getAvailableModels` returns a copy to prevent external mutation of the internal state.
