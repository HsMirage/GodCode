## Context Manager & Prompt Template Services

### Context Manager Service

- Implemented sliding window context management in `src/main/services/context-manager.service.ts`.
- Features:
  - Sliding window selection based on token limit (default 8000 tokens).
  - System message prioritization (always kept if possible).
  - Recent message prioritization.
  - Basic session summarization (first 50 messages).
  - Message cleanup utility.
- Tech Stack: Prisma for data access, simple heuristic for token estimation (1 token ≈ 4 english chars / 2 chinese chars).

### Prompt Template Service

- Implemented file-based prompt template system in `src/main/services/prompt-template.service.ts`.
- Features:
  - CRUD operations for templates.
  - Categories: system, user, custom.
  - Variable substitution (format `{variableName}`).
  - Storage location: `app.getPath('userData')/prompts`.
  - Default template initialization.
