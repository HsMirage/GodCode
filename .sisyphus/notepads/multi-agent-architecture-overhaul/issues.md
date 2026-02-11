## Known Issues (Pre-execution)

- P0: getOrCreateDefaultSession() stores tasks to wrong session (workforce-engine.ts:305, delegate-engine.ts:193)
- P0: SmartRouter regex overrides user agent selection (smart-router.ts:36-63)
- P0: Agent identity is cosmetic in direct mode - no system prompt or tool injection
- P1: workflowEvents.emit() called 4 times but .on() called 0 times
- P2: HookManager fully implemented but never wired (dead code)
