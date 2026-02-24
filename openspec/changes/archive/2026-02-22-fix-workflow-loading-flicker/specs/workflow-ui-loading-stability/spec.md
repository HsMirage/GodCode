## ADDED Requirements

### Requirement: Deterministic workflow detail loading state
The workflow detail UI SHALL use a deterministic state machine with `idle`, `loading`, `ready`, and `error` states for each selected workflow.

#### Scenario: Enter loading state on workflow selection
- **WHEN** a user selects a workflow node from the diagram
- **THEN** the UI enters `loading` for that selected workflow and marks the selection as active

#### Scenario: Resolve to ready state on successful response
- **WHEN** the selected workflow detail request succeeds
- **THEN** the UI transitions to `ready` and renders the returned workflow details

#### Scenario: Resolve to error state on failed response
- **WHEN** the selected workflow detail request fails
- **THEN** the UI transitions to `error` and exposes a recoverable retry path

### Requirement: Last-selection-wins response ownership
The workflow detail UI SHALL apply response data only when the response belongs to the most recent active selection.

#### Scenario: Ignore stale response after rapid reselection
- **WHEN** a user selects workflow A and then workflow B before A returns
- **THEN** the UI ignores A's late response and keeps B as the active rendered detail

#### Scenario: Maintain active selection identity through concurrent requests
- **WHEN** multiple in-flight detail requests exist for different selections
- **THEN** the UI binds rendered content to the current active selection identity only

### Requirement: Flicker-free panel transition during loading
The workflow detail panel SHALL preserve a stable container during selection changes and SHALL NOT blank/re-mount the entire panel while loading.

#### Scenario: Preserve stable view while loading next workflow
- **WHEN** the user switches to another workflow and the next detail is still loading
- **THEN** the panel keeps a stable placeholder or previous valid content until new data is ready

#### Scenario: No visible blank flash on workflow switch
- **WHEN** detail content changes from one workflow to another
- **THEN** the transition occurs without an intermediate blank frame presented to the user
