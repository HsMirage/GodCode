## Purpose

TBD - migrated from change `parallel-collaboration-kernel-and-ide-core`.

## Requirements

### Requirement: Workflow decomposition and DAG orchestration
The system SHALL decompose complex user intents into executable sub-tasks with explicit dependencies and execute them as a directed acyclic graph under a single workflow identifier.

#### Scenario: Decompose and run dependency graph
- **WHEN** a request is routed to workforce orchestration
- **THEN** the system creates a workflow plan with sub-tasks, dependency edges, and execution order constraints

#### Scenario: Reject invalid cyclic graph before execution
- **WHEN** decomposition results in cyclic or unschedulable dependencies
- **THEN** the system marks the workflow as invalid and returns actionable diagnostics without starting execution

### Requirement: Role-based collaborative execution stages
The system SHALL execute each workflow through explicit collaborative stages: plan, dispatch, checkpoint, integration, and finalize, with enforced primary-agent stage ownership and handoff contracts, and SHALL enter a bounded recovery sub-flow on task failure.

#### Scenario: Enforce stage transitions
- **WHEN** a workflow starts
- **THEN** the system records stage transitions, assigned stage owners, and SHALL NOT skip required checkpoint and integration stages

#### Scenario: Checkpoint can adjust remaining work
- **WHEN** a checkpoint detects quality or coverage gaps
- **THEN** the system updates remaining task assignments and dependencies before continuing execution

#### Scenario: Enforce canonical stage ownership
- **WHEN** a workflow enters plan, dispatch, checkpoint, integration, or finalize stage
- **THEN** the system enforces canonical ownership (`fuxi` for planning, `haotian` for orchestration stages, and `kuafu` for execution receipts consumed by orchestration) and blocks transitions that lack required handoff artifacts

#### Scenario: Trigger orchestrated recovery on execution failure
- **WHEN** an execution task fails in a recoverable class
- **THEN** orchestration enters a recovery sub-flow owned by `haotian`, delegates repair tasks through approved execution paths, and resumes normal stage progression only after recovery validation passes

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
