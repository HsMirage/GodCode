## ADDED Requirements

### Requirement: Error classification and recovery policy selection
The system SHALL classify task execution failures and select a recovery policy before deciding whether to retry, delegate repair, or terminate.

#### Scenario: Classify failure before recovery
- **WHEN** a task run fails during workflow execution
- **THEN** the system records a failure class (for example transient, configuration, dependency, implementation, permission, or unknown) and selects the matching recovery policy

#### Scenario: Fail fast on non-recoverable policy
- **WHEN** a failure maps to a non-recoverable policy
- **THEN** the system stops autonomous recovery for that task and returns actionable diagnostics with remediation guidance

### Requirement: Controlled autonomous recovery loop
The system SHALL execute autonomous recovery in bounded attempts with deterministic transitions through classify, plan, fix, validate, and resume-or-abort states.

#### Scenario: Execute bounded recovery attempts
- **WHEN** a failure is marked recoverable
- **THEN** the system runs recovery attempts up to configured limits and records each attempt state transition and outcome

#### Scenario: Abort after budget exhaustion
- **WHEN** recovery attempt budget is exhausted without successful validation
- **THEN** the system marks the task as unrecovered, stops further autonomous attempts, and emits escalation diagnostics

### Requirement: Recovery evidence and continuation contract
The system SHALL require each recovery attempt to produce structured evidence and SHALL only resume workflow progression after validation succeeds.

#### Scenario: Produce structured recovery evidence
- **WHEN** a recovery attempt applies a fix
- **THEN** the attempt output includes objective, changes, validation, and residual-risk fields with source error linkage

#### Scenario: Resume workflow after successful recovery
- **WHEN** recovery validation succeeds
- **THEN** the workflow resumes from the appropriate continuation point and marks the failure as recovered in workflow metadata
