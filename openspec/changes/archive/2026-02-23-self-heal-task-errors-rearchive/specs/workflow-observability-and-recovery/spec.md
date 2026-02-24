## MODIFIED Requirements

### Requirement: End-to-end workflow observability
The system SHALL expose correlated workflow, task, and run telemetry with stable identifiers and status transitions, SHALL return workflow detail snapshots that converge to the currently selected workflow without indefinite loading, and SHALL include recovery timeline visibility for failed-and-recovered tasks.

#### Scenario: Inspect workflow execution timeline
- **WHEN** a user opens workflow details
- **THEN** the system returns stage timeline, task transitions, assigned models, and execution outcomes

#### Scenario: Correlate run logs to task and workflow
- **WHEN** run logs are queried
- **THEN** each log entry includes task and workflow correlation identifiers

#### Scenario: Converge detail loading to selected workflow
- **WHEN** workflow detail requests are issued for multiple selections in close succession
- **THEN** responses include stable workflow identity metadata enabling consumers to commit only the currently selected workflow snapshot

#### Scenario: Expose recovery timeline details
- **WHEN** a task failure enters autonomous recovery
- **THEN** workflow detail output includes recovery attempt timeline, selected strategy, validator result, and final recovery status

### Requirement: Durable retry state and failure taxonomy
The system SHALL persist retry attempts, recovery attempts, and failure classifications to support deterministic retry and autonomous recovery behavior across restarts.

#### Scenario: Continue retry policy after process restart
- **WHEN** the process restarts during a retrying workflow
- **THEN** the system resumes with persisted retry counters and remaining policy budget

#### Scenario: Apply failure-class-specific retry
- **WHEN** a task fails with a classified retryable error
- **THEN** the system retries according to configured backoff and maximum attempts for that class

#### Scenario: Continue autonomous recovery after restart
- **WHEN** the process restarts during an in-progress recovery attempt
- **THEN** the system restores recovery state and resumes from the last durable recovery phase without losing attempt history

#### Scenario: Record terminal unrecovered outcome
- **WHEN** recovery attempts are exhausted or classified non-recoverable
- **THEN** the system records a terminal unrecovered status with failure class, last attempted strategy, and remediation diagnostics
