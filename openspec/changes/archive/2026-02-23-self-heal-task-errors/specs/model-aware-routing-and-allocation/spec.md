## MODIFIED Requirements

### Requirement: Model-aware route resolution
The system SHALL resolve execution route using intent complexity, required capabilities, and binding rules across agent, category, provider, and model, with priority `explicit primary agent selection > category policy > model binding`, and SHALL apply error-class-aware routing for recovery tasks.

#### Scenario: Route complex intent to workforce
- **WHEN** a user request exceeds direct execution complexity threshold
- **THEN** the system routes the request to workforce orchestration with recorded routing rationale

#### Scenario: Respect explicit agent or category request
- **WHEN** a request explicitly targets a valid agent or category
- **THEN** the system applies the explicit target unless blocked by policy constraints

#### Scenario: Preserve explicit primary-agent intent through model resolution
- **WHEN** a request explicitly selects `fuxi`, `haotian`, or `kuafu`
- **THEN** route resolution preserves selected primary-agent role semantics and only chooses category/provider/model combinations compatible with that role policy

#### Scenario: Fail with diagnostics on role-model policy conflict
- **WHEN** explicit primary-agent intent conflicts with available category/model policy constraints
- **THEN** the system fails fast with diagnostics that include conflict reason, attempted route, and valid alternatives

#### Scenario: Route recovery task by failure class and capability
- **WHEN** orchestration dispatches a recovery task after failure classification
- **THEN** routing selects compatible category/subagent and model policy based on failure class, required repair capability, and current binding constraints

#### Scenario: Fail with diagnostics on unavailable recovery route
- **WHEN** no compatible recovery route exists for the selected failure class and policy constraints
- **THEN** the system fails fast with attempted recovery route details and actionable alternative categories or binding fixes
