## ADDED Requirements

### Requirement: Integrated code editing workflow
The IDE workbench SHALL provide in-app code editing, save, and conflict-aware update behavior within selected workspace boundaries.

#### Scenario: Edit and save file in workbench
- **WHEN** a user opens a text/code artifact and performs edits
- **THEN** the system saves changes to the workspace and updates related task/artifact state

#### Scenario: Handle external file modification conflict
- **WHEN** a file was modified externally after being opened in editor
- **THEN** the system detects the conflict and prompts the user with merge or reload options
- **AND** merge mode inserts conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) for manual reconciliation before save

### Requirement: Terminal and background task center
The IDE workbench SHALL provide terminal command execution, background task tracking, output inspection, and cancellation controls.

#### Scenario: Run command with live output
- **WHEN** a user starts a terminal command from workbench
- **THEN** the UI shows incremental output, status, and final exit result

#### Scenario: Manage background tasks
- **WHEN** multiple background tasks are active
- **THEN** the task center lists running/pending/completed tasks and supports output retrieval and cancellation

### Requirement: Cross-panel execution trace linkage
The workbench SHALL link workflow nodes, agent activities, artifacts, and run logs through shared identifiers.

#### Scenario: Navigate from task node to logs and artifacts
- **WHEN** a user selects a workflow node
- **THEN** the UI provides direct navigation to related run logs and produced artifacts

#### Scenario: Navigate from artifact to source task
- **WHEN** a user opens an artifact detail
- **THEN** the UI shows source task context and execution history links
