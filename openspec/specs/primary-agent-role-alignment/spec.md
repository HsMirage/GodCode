## Purpose

Align primary agent semantics with canonical role ownership and handoff contracts for planning, orchestration, and execution within CodeAll.

## Requirements

### Requirement: Canonical primary agent role mapping
The system SHALL enforce a canonical primary-agent mapping where Prometheus semantics map to `fuxi` (planning), Sisyphus semantics map to `haotian` (orchestration), and Atlas semantics map to `kuafu` (plan execution).

#### Scenario: Resolve canonical role mapping
- **WHEN** a workflow initializes with a selected primary agent
- **THEN** the system resolves the selected agent to its canonical planning/orchestration/execution role semantics and records the mapping in workflow metadata

#### Scenario: Reject unknown primary role alias
- **WHEN** a request references an unknown or disabled primary role alias
- **THEN** the system fails with actionable diagnostics including valid role aliases and remediation guidance

### Requirement: Stage ownership and handoff contract
The system SHALL enforce stage ownership and handoff contracts across primary agents for plan, dispatch, checkpoint, integration, and finalize stages.

#### Scenario: Enforce stage owner for planning
- **WHEN** a workflow enters the plan stage
- **THEN** the stage owner is `fuxi`, and the stage completes only after a plan artifact and handoff summary are recorded

#### Scenario: Enforce stage owner for orchestration
- **WHEN** a workflow enters dispatch, checkpoint, or integration stage
- **THEN** the stage owner is `haotian`, and transitions require explicit handoff references to upstream stage outputs

#### Scenario: Enforce execution receipt from plan executor
- **WHEN** execution tasks are delegated from orchestration
- **THEN** `kuafu` returns structured execution receipts that include task evidence, unresolved items, and status for integration

### Requirement: Structured acceptance evidence output
The system SHALL require primary-agent outputs to include structured acceptance evidence that can be consumed by checkpoint and integration logic.

#### Scenario: Record evidence for completed execution unit
- **WHEN** an execution unit is marked completed
- **THEN** the output includes objective, applied changes, validation evidence, and residual risk fields

#### Scenario: Block finalize without minimum evidence fields
- **WHEN** finalize is requested with missing required evidence fields
- **THEN** the system blocks finalization and returns missing-field diagnostics

### Requirement: Primary-agent role boundary enforcement
The system SHALL enforce role boundaries so that primary agents cannot bypass required handoff steps or execute out-of-scope responsibilities under strict role mode.

#### Scenario: Prevent direct execution by planning role under strict mode
- **WHEN** strict role mode is enabled and `fuxi` attempts execution-stage operations
- **THEN** the system rejects the operation and instructs handoff to orchestration/execution stages

#### Scenario: Allow controlled override with audit trail
- **WHEN** an authorized override policy permits temporary boundary exceptions
- **THEN** the system allows the operation and records override actor, reason, scope, and expiry in audit logs
