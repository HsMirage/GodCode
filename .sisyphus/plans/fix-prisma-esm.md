# Fix Prisma ESM Import Error

## TL;DR

> **Quick Summary**: Fix the PrismaClient ESM/CommonJS import compatibility issue causing app crash on startup.
>
> **Deliverables**:
>
> - Fixed `database.ts` with correct CommonJS-compatible import
>
> **Estimated Effort**: Quick (< 5 minutes)
> **Parallel Execution**: NO - single file fix
> **Critical Path**: Fix import → Rebuild → Test

---

## Context

### Original Request

User ran the built application (`CodeAll Setup 1.0.0.exe`) and encountered a JavaScript error:

```
SyntaxError: Named export 'PrismaClient' not found. The requested module '@prisma/client' is a CommonJS module
```

### Root Cause

The `@prisma/client` package is a CommonJS module, but the project uses ESM (`"type": "module"` in package.json). Named imports from CommonJS modules don't work in ESM context.

---

## Work Objectives

### Core Objective

Fix the PrismaClient import to be compatible with ESM/CommonJS interop.

### Concrete Deliverables

- Modified `src/main/services/database.ts`

### Definition of Done

- [ ] App launches without ESM import error
- [ ] Database initializes correctly

### Must Have

- Use default import pattern for CommonJS module

### Must NOT Have (Guardrails)

- Don't change any database logic
- Don't modify other files

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **User wants tests**: NO - this is a quick fix
- **QA approach**: Manual verification after rebuild

---

## TODOs

- [ ] 1. Fix PrismaClient import in database.ts

  **What to do**:
  Change the named import to default import pattern:

  **FROM:**

  ```typescript
  import { PrismaClient } from '@prisma/client'
  ```

  **TO:**

  ```typescript
  import pkg from '@prisma/client'
  const { PrismaClient } = pkg
  ```

  **File**: `src/main/services/database.ts` (line 5)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]` (no special skills needed)

  **Acceptance Criteria**:
  - [ ] Import statement changed to default import pattern
  - [ ] TypeScript compiles without errors: `pnpm run build` succeeds
  - [ ] App launches without "Named export 'PrismaClient' not found" error

  **Commit**: YES
  - Message: `fix(database): use CommonJS-compatible import for PrismaClient`
  - Files: `src/main/services/database.ts`

---

- [ ] 2. Rebuild Windows installer

  **What to do**:
  Run the build command again to create updated installer:

  ```bash
  pnpm build:win
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Acceptance Criteria**:
  - [ ] Build completes successfully
  - [ ] `dist/CodeAll Setup 1.0.0.exe` is regenerated

  **Commit**: NO

---

## Success Criteria

### Verification Commands

```bash
pnpm run build  # Should complete without errors
```

### Final Checklist

- [ ] No ESM import errors on app launch
- [ ] Database service initializes correctly
