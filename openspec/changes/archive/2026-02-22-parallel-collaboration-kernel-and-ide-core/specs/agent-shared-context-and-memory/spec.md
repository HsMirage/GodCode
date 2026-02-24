## ADDED Requirements

### Requirement: Shared collaboration context model
The system SHALL maintain a workflow-scoped shared context model that includes facts, decisions, constraints, produced artifacts, and dependency outputs.

#### Scenario: Create shared context at workflow start
- **WHEN** a workflow is initialized
- **THEN** the system creates an empty shared context record linked to the workflow identifier

#### Scenario: Update context after task completion
- **WHEN** a sub-task completes with output and metadata
- **THEN** the system appends normalized context entries and links them to producing task identifiers

### Requirement: Role-aware context injection
The system SHALL inject shared context into each sub-task prompt according to assigned role and declared dependencies.

#### Scenario: Inject dependency-scoped context
- **WHEN** a sub-task is dispatched with dependencies
- **THEN** the system includes dependency outputs and relevant shared context entries in the task input

#### Scenario: Filter context by role
- **WHEN** a task is assigned to a role with restricted context policy
- **THEN** the system excludes non-permitted context categories from injection

### Requirement: Context traceability and retention
The system SHALL preserve provenance for context entries and support retrieval by workflow, task, and category.

#### Scenario: Retrieve provenance for an integrated conclusion
- **WHEN** a user inspects workflow reasoning for a conclusion
- **THEN** the system returns linked context entries and originating task references

#### Scenario: Apply retention policy
- **WHEN** context retention window expires
- **THEN** the system archives or prunes entries per policy while preserving required audit metadata
