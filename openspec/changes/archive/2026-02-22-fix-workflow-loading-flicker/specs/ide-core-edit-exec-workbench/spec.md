## MODIFIED Requirements

### Requirement: Cross-panel execution trace linkage
The workbench SHALL link workflow nodes, agent activities, artifacts, and run logs through shared identifiers, and SHALL provide stable, non-flickering panel transitions when navigating from workflow nodes to related views.

#### Scenario: Navigate from task node to logs and artifacts
- **WHEN** a user selects a workflow node
- **THEN** the UI provides direct navigation to related run logs and produced artifacts

#### Scenario: Navigate from artifact to source task
- **WHEN** a user opens an artifact detail
- **THEN** the UI shows source task context and execution history links

#### Scenario: Keep panel stable during workflow node reselection
- **WHEN** a user rapidly switches between workflow nodes
- **THEN** the workbench keeps a stable detail panel shell and updates content for the latest selection without visible blink or blank intermediate frame
