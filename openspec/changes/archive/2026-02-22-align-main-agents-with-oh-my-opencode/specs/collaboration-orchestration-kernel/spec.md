## MODIFIED Requirements

### Requirement: Role-based collaborative execution stages
The system SHALL execute each workflow through explicit collaborative stages: plan, dispatch, checkpoint, integration, and finalize, with enforced primary-agent stage ownership and handoff contracts.

#### Scenario: Enforce stage transitions
- **WHEN** a workflow starts
- **THEN** the system records stage transitions, assigned stage owners, and SHALL NOT skip required checkpoint and integration stages

#### Scenario: Checkpoint can adjust remaining work
- **WHEN** a checkpoint detects quality or coverage gaps
- **THEN** the system updates remaining task assignments and dependencies before continuing execution

#### Scenario: Enforce canonical stage ownership
- **WHEN** a workflow enters plan, dispatch, checkpoint, integration, or finalize stage
- **THEN** the system enforces canonical ownership (`fuxi` for planning, `haotian` for orchestration stages, and `kuafu` for execution receipts consumed by orchestration) and blocks transitions that lack required handoff artifacts

### Requirement: Semantic result integration
The system SHALL produce a structured integrated result from sub-task outputs rather than plain concatenation, including role-based evidence and handoff trace references.

#### Scenario: Integrate multi-agent outputs
- **WHEN** all required sub-tasks are completed
- **THEN** the system generates an integrated result containing consolidated conclusions, unresolved items, and source task references

#### Scenario: Handle conflicting outputs
- **WHEN** sub-task outputs conflict on key conclusions
- **THEN** the system flags conflicts and records reconciliation outcome in the integrated result

#### Scenario: Require evidence-complete integration
- **WHEN** integration runs with missing required evidence fields from delegated execution
- **THEN** the system marks integration incomplete and returns actionable evidence-gap diagnostics before finalize
