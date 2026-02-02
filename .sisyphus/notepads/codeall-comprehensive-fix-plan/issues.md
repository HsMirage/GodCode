## IPC Security Audit Findings

### 1. Missing Path Validation in IPC Handlers
- **File**: `src/main/ipc/handlers/artifact.ts`
  - **Handler**: `file:read`
    - Direct `fs.readFileSync(filePath)` without `PathValidator`.
    - Vulnerability: Arbitrary file read (LFI) if attacker controls path.
  - **Handler**: `shell:open-path`
    - Direct `shell.openPath(filePath)` without validation.
    - Vulnerability: Arbitrary file execution/opening.
  - **Handler**: `artifact:download`
    - Constructs path: `path.join(downloadsDir, filename)`.
    - Vulnerability: Potential path traversal if `filename` contains `../`.

### 2. Missing Audit Logging
- **Critical Operations Missing Logs**:
  - `file:read`: No audit log when file content is accessed.
  - `shell:open-path`: No audit log when file is opened via OS shell.
  - `artifact:download`: No audit log when file is written to disk.
  - `artifact:delete`: No audit log when artifact is deleted.
  - `space:create`, `space:delete`: Space operations are not audited in IPC handler (need verification if service layer handles it).

### 3. Inconsistent Security Controls
- **PathValidator** is available in `src/shared/path-validator.ts` but NOT used in `artifact.ts`.
- **AuditLogService** is available but NOT used in `artifact.ts`.

### 4. Tool Execution Safety
- `file_read` tool (internal tool) implements manual checks: `if (!filePath.startsWith(context.workspaceDir))`.
- Recommendation: Refactor to use `PathValidator` consistently across tools and IPC.

## Architecture Disconnects (2026-02-02)

### 1. Active UI Uses Mock Components
- **Severity**: Critical
- **Location**: `src/renderer/src/components/layout/MainLayout.tsx`
- **Problem**: Production build renders `layout/ChatView.tsx` (stub) instead of `pages/ChatPage.tsx` or `chat/MessageList.tsx`. The app looks functional but performs no real actions.
- **Evidence**: `MainLayout.tsx` imports:
  ```typescript
  import { ChatView } from './ChatView'       // Stub
  import { ArtifactRail } from './ArtifactRail' // Stub
  import { ContentCanvas } from './ContentCanvas' // Stub
  ```

### 2. Orphaned "Real" Components
- **Severity**: High
- **Problem**: High-value components with IPC integration are fully implemented but unreachable.
  - `ChatPage.tsx`: Handles session init, message streaming.
  - `ArtifactRail.tsx` (Real): Handles artifact CRUD.
  - `WorkflowView.tsx`: Handles task visualization.
- **Fix Required**: Refactor `MainLayout` to accept these as props or import the "Real" versions directly.

### 3. Naming Collisions
- **Severity**: Medium
- **Problem**: Identical filenames in different directories (`layout/ArtifactRail.tsx` vs `artifact/ArtifactRail.tsx`) cause confusion and import errors.
- **Recommendation**: Rename layout stubs to `*.stub.tsx` or `Mock*.tsx` to clearly distinguish them from production code.
