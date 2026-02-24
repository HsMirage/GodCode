## ADDED Requirements

### Requirement: Unified model and agent binding governance
The system SHALL provide unified governance for provider, model, agent, and category bindings with pre-execution validation.

#### Scenario: Validate binding consistency before execution
- **WHEN** a workflow or delegate task is about to dispatch
- **THEN** the system validates that referenced provider/model/agent/category bindings are valid and usable

#### Scenario: Reject inconsistent binding configuration
- **WHEN** binding references unavailable provider credentials or unknown models
- **THEN** the system fails with explicit diagnostics and remediation hints

### Requirement: Secure API key handling and policy enforcement
The system SHALL store API keys securely and enforce UI and runtime policies that prevent accidental credential exposure.

#### Scenario: Persist API key securely
- **WHEN** a user saves provider credentials
- **THEN** keys are stored using secure encryption/keychain mechanisms and never persisted in plaintext configuration

#### Scenario: Enforce credential display policy
- **WHEN** user views provider settings
- **THEN** credential fields are masked by default and reveal actions require explicit user intent

### Requirement: Configuration change auditability
The system SHALL record auditable configuration changes for bindings and provider settings.

#### Scenario: Track model binding update
- **WHEN** a user updates default model or agent binding
- **THEN** the system records who changed what and when in configuration audit records

#### Scenario: Trace execution to effective binding snapshot
- **WHEN** a task run is inspected
- **THEN** the system shows effective binding snapshot used at dispatch time
