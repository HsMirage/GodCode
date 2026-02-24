## 1. Sanitization Boundary in Main Process

- [x] 1.1 Identify and centralize the user-facing completion summary assembly path in orchestration/integration code.
- [x] 1.2 Implement a deterministic completion-output sanitizer that removes protocol/tool-call wrapper artifacts while preserving meaningful narrative and validation statements.
- [x] 1.3 Apply the sanitizer to all user-visible completion summary outputs and ensure non-user telemetry paths continue receiving raw output.
- [x] 1.4 Add focused unit tests for sanitizer behavior, including wrapper stripping, multilingual content preservation, and deterministic equivalent-output cases.

## 2. Integration and Observability Contract Updates

- [x] 2.1 Update workflow integration result construction to use sanitized text for user-facing summary fields.
- [x] 2.2 Preserve raw delegate/task output in observability/run-log structures used for diagnostics and recovery traceability.
- [x] 2.3 Add/adjust integration tests to assert the dual-channel contract: sanitized presentation output plus raw telemetry evidence.

## 3. Renderer Surface Consistency

- [x] 3.1 Audit chat/workflow UI consumers of completion output and route display to sanitized summary fields only.
- [x] 3.2 Add renderer or end-to-end regression coverage ensuring garbled tool-wrapper fragments are not displayed in completion views.

## 4. Verification and Guardrails

- [x] 4.1 Add regression fixtures based on observed garbled Luban completion payload patterns, including embedded tool-call JSON snippets.
- [x] 4.2 Run targeted backend and frontend test suites for workforce/delegate/workflow view output handling.
- [x] 4.3 Run typecheck/build validation and confirm no user-visible completion output regression in relevant workflow scenarios.