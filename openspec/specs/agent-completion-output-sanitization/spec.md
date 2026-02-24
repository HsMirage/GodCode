## Purpose

Define how agent completion output is sanitized for user-facing presentation while preserving raw execution evidence for diagnostics and observability.

## Requirements

### Requirement: Sanitized user-facing completion output
The system SHALL sanitize agent completion output before presenting it in user-facing workflow/chat summaries so that transport-layer and tool-call wrapper artifacts are removed.

#### Scenario: Strip tool wrapper artifacts from completion summary
- **WHEN** a completion payload includes protocol/tool wrapper content (for example `assistant to=functions.bash`, tool-call envelopes, or embedded command JSON wrappers)
- **THEN** the presented completion summary excludes those wrapper artifacts and retains only user-meaningful completion text

#### Scenario: Preserve multilingual completion narrative
- **WHEN** a completion payload contains multilingual narrative text mixed with wrapper artifacts
- **THEN** the sanitizer removes wrapper artifacts without corrupting retained multilingual narrative content

### Requirement: Deterministic sanitization behavior
The system SHALL apply deterministic sanitization rules so equivalent completion payloads produce equivalent user-visible summaries.

#### Scenario: Equivalent inputs produce identical sanitized output
- **WHEN** two completion payloads differ only in equivalent wrapper formatting noise
- **THEN** the resulting sanitized summaries are equivalent in content

### Requirement: Separate user presentation from telemetry detail
The system SHALL preserve raw completion payloads for internal telemetry while exposing sanitized summaries to user-visible channels.

#### Scenario: Preserve raw payload in telemetry
- **WHEN** a completion payload is processed for display
- **THEN** raw payload content remains available in run/workflow telemetry and the user-visible summary uses sanitized content
