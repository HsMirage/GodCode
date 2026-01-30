## Patterns & Conventions
- Used `EventEmitter` from `events` to mock `ChildProcess` behavior for `once` and `emit` methods.
- Used `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync()` to test timeouts in async `cleanupAll` method.
- Followed single-quote and no-semicolon style.
