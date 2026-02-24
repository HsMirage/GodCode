## MODIFIED Requirements

### Requirement: End-to-end workflow observability
The system SHALL expose correlated workflow, task, and run telemetry with stable identifiers and status transitions, and SHALL return workflow detail snapshots that converge to the currently selected workflow without indefinite loading.

#### Scenario: Inspect workflow execution timeline
- **WHEN** a user opens workflow details
- **THEN** the system returns stage timeline, task transitions, assigned models, and execution outcomes

#### Scenario: Correlate run logs to task and workflow
- **WHEN** run logs are queried
- **THEN** each log entry includes task and workflow correlation identifiers

#### Scenario: Converge detail loading to selected workflow
- **WHEN** workflow detail requests are issued for multiple selections in close succession
- **THEN** responses include stable workflow identity metadata enabling consumers to commit only the currently selected workflow snapshot

### Requirement: Session recovery and continuation consistency
The system SHALL recover interrupted workflows and provide consistent continuation state for front-end and orchestrator consumers, including monotonic status progression for workflow detail queries.

#### Scenario: Recover interrupted running tasks
- **WHEN** the system starts and finds interrupted workflows
- **THEN** it reconstructs continuation state and marks tasks for resume or requeue according to policy

#### Scenario: Expose continuation status to UI
- **WHEN** the UI requests continuation status for a session or workflow
- **THEN** the system returns a consistent and up-to-date state snapshot

#### Scenario: Avoid perpetual loading after recovery
- **WHEN** a recovered workflow is queried for detail state
- **THEN** the system returns a terminal detail status (`ready` or explicit failure state) instead of an unbounded loading response
