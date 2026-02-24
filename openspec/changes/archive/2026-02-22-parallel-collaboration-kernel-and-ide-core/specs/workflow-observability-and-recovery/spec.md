## ADDED Requirements

### Requirement: End-to-end workflow observability
The system SHALL expose correlated workflow, task, and run telemetry with stable identifiers and status transitions.

#### Scenario: Inspect workflow execution timeline
- **WHEN** a user opens workflow details
- **THEN** the system returns stage timeline, task transitions, assigned models, and execution outcomes

#### Scenario: Correlate run logs to task and workflow
- **WHEN** run logs are queried
- **THEN** each log entry includes task and workflow correlation identifiers

### Requirement: Durable retry state and failure taxonomy
The system SHALL persist retry attempts and classify failures to support deterministic retry behavior across restarts.

#### Scenario: Continue retry policy after process restart
- **WHEN** the process restarts during a retrying workflow
- **THEN** the system resumes with persisted retry counters and remaining policy budget

#### Scenario: Apply failure-class-specific retry
- **WHEN** a task fails with a classified retryable error
- **THEN** the system retries according to configured backoff and maximum attempts for that class

### Requirement: Session recovery and continuation consistency
The system SHALL recover interrupted workflows and provide consistent continuation state for front-end and orchestrator consumers.

#### Scenario: Recover interrupted running tasks
- **WHEN** the system starts and finds interrupted workflows
- **THEN** it reconstructs continuation state and marks tasks for resume or requeue according to policy

#### Scenario: Expose continuation status to UI
- **WHEN** the UI requests continuation status for a session or workflow
- **THEN** the system returns a consistent and up-to-date state snapshot
