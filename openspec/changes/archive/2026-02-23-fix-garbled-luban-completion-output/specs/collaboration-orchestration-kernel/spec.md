## MODIFIED Requirements

### Requirement: Semantic result integration
The system SHALL produce a structured integrated result from sub-task outputs rather than plain concatenation, including role-based evidence, handoff trace references, and recovery outcomes, and SHALL ensure user-visible integration summaries exclude transport/protocol wrapper artifacts while preserving raw execution payloads in observability channels.

#### Scenario: Integrate multi-agent outputs
- **WHEN** all required sub-tasks are completed
- **THEN** the system generates an integrated result containing consolidated conclusions, unresolved items, and source task references

#### Scenario: Handle conflicting outputs
- **WHEN** sub-task outputs conflict on key conclusions
- **THEN** the system flags conflicts and records reconciliation outcome in the integrated result

#### Scenario: Require evidence-complete integration
- **WHEN** integration runs with missing required evidence fields from delegated execution
- **THEN** the system marks integration incomplete and returns actionable evidence-gap diagnostics before finalize

#### Scenario: Include recovery outcome in integration
- **WHEN** one or more failed tasks are recovered before finalize
- **THEN** the integrated result includes recovery attempts, applied fix summary, and residual risk trace for each recovered task

#### Scenario: Exclude protocol artifacts from user-visible integration summaries
- **WHEN** delegated task output includes protocol wrapper artifacts or raw tool-call envelope fragments
- **THEN** integration summary content presented to users excludes those artifacts while preserving task conclusions and validation statements

#### Scenario: Keep raw integration evidence for observability
- **WHEN** integration sanitizes output for user presentation
- **THEN** observability and run-log channels retain raw execution payload evidence for diagnostics and traceability