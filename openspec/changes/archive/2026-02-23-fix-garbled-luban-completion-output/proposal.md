## Why

When Luban reports task completion, some replies include raw tool-call payload fragments and escaped JSON tokens, producing garbled user-visible output. This reduces trust in completion results and obscures whether validation actually succeeded.

## What Changes

- Normalize agent completion messages so end users only see clean, human-readable summaries.
- Strip or isolate raw tool invocation payloads (e.g., `assistant to=functions.bash`, JSON command blocks) from final user-facing completion text.
- Preserve validation evidence (typecheck/build/test outcomes) in structured workflow/run telemetry without leaking transport/debug formatting into chat replies.
- Add deterministic formatting rules for completion responses so multilingual text and quoted command content do not corrupt rendering.
- Add regression coverage for garbled completion output patterns.

## Capabilities

### New Capabilities
- `agent-completion-output-sanitization`: Ensure completion replies are rendered as clean user-facing summaries while raw execution payloads remain in internal telemetry.

### Modified Capabilities
- `collaboration-orchestration-kernel`: Tighten integration requirements so final integrated results and execution receipts exclude transport-layer/tool-call artifacts in user-visible output.

## Impact

- Main-process orchestration and integration paths that build completion messages (workforce/delegate/event bridge).
- Renderer chat/workflow views that display completion summaries.
- Logging/telemetry boundaries between user-visible messages and execution internals.
- Unit/integration tests for workforce completion formatting and tool-output handling.