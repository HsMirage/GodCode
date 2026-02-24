## ADDED Requirements

### Requirement: Model-aware route resolution
The system SHALL resolve execution route using intent complexity, required capabilities, and binding rules across agent, category, provider, and model.

#### Scenario: Route complex intent to workforce
- **WHEN** a user request exceeds direct execution complexity threshold
- **THEN** the system routes the request to workforce orchestration with recorded routing rationale

#### Scenario: Respect explicit agent or category request
- **WHEN** a request explicitly targets a valid agent or category
- **THEN** the system applies the explicit target unless blocked by policy constraints

### Requirement: Resource allocation by concurrency key
The system SHALL allocate execution slots by concurrency key dimensions including provider/model and role, with configurable quotas.

#### Scenario: Prevent model hotspot overload
- **WHEN** concurrent tasks exceed quota for a provider/model key
- **THEN** the scheduler queues excess tasks and dispatches them only when slots are available

#### Scenario: Preserve fairness across workflows
- **WHEN** multiple workflows compete for the same concurrency key
- **THEN** the scheduler applies deterministic fairness policy and avoids starvation

### Requirement: Fallback and degradation policy
The system SHALL apply deterministic fallback when a bound model is unavailable, and record fallback decisions for audit.

#### Scenario: Fallback to compatible model
- **WHEN** the preferred model is unavailable or misconfigured
- **THEN** the system selects the highest-priority compatible fallback model and records the selection reason

#### Scenario: Hard fail under strict binding mode
- **WHEN** strict binding mode is enabled and no compatible model is available
- **THEN** the system fails fast with actionable configuration diagnostics
