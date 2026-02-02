## Learnings from Task 8: ChatView IPC Integration

## Patterns

- **Streaming State Management**: Using `useRef` for the streaming accumulator prevents race conditions during rapid state updates from IPC events. This is critical for smooth text rendering in streaming interfaces.
- **Preload Allowlist**: IPC channels must be explicitly allowed in `src/main/preload.ts` (e.g., `message:stream-chunk`). Without this, the renderer cannot receive the event even if the listener is set up correctly.

## Gotchas

- **Dynamic Imports**: `browser-view.service.ts` is both statically and dynamically imported, causing a build warning. This doesn't break the build but indicates a potential architectural optimization (use consistent import strategy).
- **Tailwind Class Preservation**: When refactoring logic, ensure `className` props and existing layout structures (like `flex flex-col h-full`) remain untouched to avoid regression in UI/UX.

## Improvements

- **Typing Indicator**: The logic `isLoading && !streamingContent` effectively handles the transition from "Waiting for first token" to "Streaming response".
- **Session Management**: Reusing `session:get-or-create-default` ensures seamless user experience without manual session creation.

## Anthropic Streaming Tool Use Research

### Core Concepts

- **Official Documentation**: [Streaming Messages](https://docs.anthropic.com/en/api/messages-streaming)
- **Event Types**:
  - `message_start`: Initial message metadata (role, model).
  - `content_block_start`: Start of a block (text or tool_use).
  - `content_block_delta`: Incremental updates (text or JSON fragments).
  - `content_block_stop`: End of a block.
  - `message_delta`: Top-level updates (stop_reason, usage).
  - `message_stop`: End of stream.

### Tool Use Implementation

When `stream=true` is set, tool calls appear as content blocks:

1. **Detection**:
   - Listen for `content_block_start` with `content_block.type === 'tool_use'`.
   - Capture `id` and `name` from this event.

2. **Accumulation**:
   - Listen for `content_block_delta` with `delta.type === 'input_json_delta'`.
   - Concatenate `delta.partial_json` strings.
   - **Important**: The delta is a _string fragment_, not a valid JSON object until complete.

3. **Completion**:
   - On `content_block_stop`, the accumulated string should be valid JSON.
   - Parse the full string to get the tool arguments.

### Fine-Grained Streaming (Beta)

- **Docs**: [Fine-grained Tool Streaming](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/fine-grained-tool-streaming)
- **Header**: `anthropic-beta: fine-grained-tool-streaming-2025-05-14`
- **Behavior**: Streams JSON tokens immediately without server-side buffering/validation.
- **Trade-off**: Lower latency vs risk of incomplete/invalid JSON if stream is cut off (e.g., `max_tokens` reached).

### Recommended Pattern (Pseudocode)

```typescript
let currentTool = null
let jsonBuffer = ''

for await (const event of stream) {
  if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
    currentTool = {
      id: event.content_block.id,
      name: event.content_block.name
    }
    jsonBuffer = ''
  }

  if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
    jsonBuffer += event.delta.partial_json
    // Optional: Attempt partial JSON parsing here for UI updates
  }

  if (event.type === 'content_block_stop') {
    if (currentTool) {
      const args = JSON.parse(jsonBuffer)
      executeTool(currentTool.name, args)
      currentTool = null
    }
  }
}
```

## Security Architecture

### Path Validation

- `PathValidator` class exists in `src/shared/path-validator.ts`.
- Methods: `isPathSafe`, `resolveSafePath`.
- Usage: Used in `FileTreeService` and `GitService`, but missing in IPC handlers.

### Audit Logging

- `AuditLogService` singleton handles logging.
- Usage: Used in `AuditLogExport` and `AuditLog` handlers, but missing in `Artifact` handlers.

### Tool Security

- Built-in tools (`file_read`, `file_list`) implement ad-hoc path validation logic (`startsWith`).
- Should be unified under `PathValidator`.

## UI Component Architecture Analysis (2026-02-02)

### Component Stub vs. Implementation Mapping

The codebase currently contains duplicate components: "Layout Stubs" (active) and "Real Implementations" (disconnected).

| Component         | Layout Stub (Active)                                                                    | Real Implementation (Disconnected)                                                                              | Status           |
| :---------------- | :-------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- | :--------------- |
| **ChatView**      | `src/renderer/src/components/layout/ChatView.tsx`<br>(Hardcoded state, mocked messages) | `src/renderer/src/pages/ChatPage.tsx`<br>(Connects to backend/IPC, handles streaming)                           | **Stub Active**  |
| **ArtifactRail**  | `src/renderer/src/components/layout/ArtifactRail.tsx`<br>(Static file tree)             | `src/renderer/src/components/artifact/ArtifactRail.tsx`<br>(Fetches artifacts from session, handles preview/dl) | **Stub Active**  |
| **ContentCanvas** | `src/renderer/src/components/layout/ContentCanvas.tsx`<br>(Basic switch, limited logic) | `src/renderer/src/components/canvas/ContentCanvas.tsx`<br>(Browser tabs, full lifecycle mgmt)                   | **Stub Active**  |
| **WorkflowView**  | N/A (Not present in layout)                                                             | `src/renderer/src/components/workflow/WorkflowView.tsx`<br>(ReactFlow integration, real-time task updates)      | **Disconnected** |

### Routing & Entry Analysis

- **Entry Point**: `src/renderer/src/App.tsx` mounts `MainLayout` at `/`.
- **MainLayout**: `src/renderer/src/components/layout/MainLayout.tsx`
  - Directly imports local stub components from `./*`.
  - Does not utilize `ChatPage` or the specialized components in `../artifact/` or `../canvas/`.
- **ChatPage**: `src/renderer/src/pages/ChatPage.tsx`
  - Appears to be an alternative "Smart Container" that attempts to orchestrate `MessageList`, `WorkflowView`, etc.
  - Currently orphaned in the routing configuration.

### Directory Structure Usage

- `src/renderer/src/components/layout/`: Currently serves as a repository for "Mock UI" used for layout testing.
- `src/renderer/src/components/{artifact,canvas,workflow,chat}/`: Contains the actual business logic components.

### Additional Finding: ChatPage Hybrid State

Even `src/renderer/src/pages/ChatPage.tsx`, which contains real session logic, imports the **Stub** versions of the side panels:

- Imports `../components/layout/ContentCanvas` (Stub) instead of `../components/canvas/ContentCanvas` (Real)
- Imports `../components/layout/ArtifactRail` (Stub) instead of `../components/artifact/ArtifactRail` (Real)

This confirms that the "Real" components (`artifact/ArtifactRail.tsx` and `canvas/ContentCanvas.tsx`) are currently **completely unused** in the application graph.

## Audit Logging (2026-02-02)

- Added best-effort audit logging for IPC handlers `file:read` and `shell:open-path` in `artifact` handlers.
- Logs capture action, entityType, entityId/metadata, and success/failure without recording file contents.

# Learnings

## ToolExecutionService Implementation (2026-02-02)

### Architecture Discovery

1. **Two Tool Interfaces Exist**:
   - `Tool` (in `tool.interface.ts`): Uses `definition` property with structured parameters array
   - `BrowserTool` (in `ai-browser/types.ts`): Direct properties with JSON Schema parameters
   - The anthropic adapter uses `BrowserTool` via `allTools` from ai-browser

2. **Existing Components**:
   - `ToolRegistry`: Simple Map-based registry for `Tool` interface
   - `ToolExecutor`: Single-tool executor with policy checks and validation
   - `PermissionPolicy`: Allow/deny lists for tool access control

3. **AnthropicAdapter Tool Loop Pattern** (lines 77-179):
   - Max 10 iterations
   - Retry with exponential backoff
   - Collects tool_use blocks from response
   - Executes tools and appends results as tool_result blocks
   - Continues until no tool_use blocks or stop_reason !== 'tool_use'

### Design Decisions

1. **Unified Tool Support**: Created `UnifiedTool` type and `isBrowserTool()` type guard to handle both interfaces
2. **Timeout Control**: Implemented per-tool timeout with Promise race pattern
3. **Loop Executor Factory**: `createLoopExecutor()` returns stateful callback that tracks iteration count
4. **Format Helper**: `formatResultsForLLM()` converts outputs to Anthropic-compatible format

### Key Patterns

- Browser tools are checked first to allow overriding registry tools
- Iteration count is tracked in closure for max iteration enforcement
- Error results still include `durationMs` for debugging

## Tool/Function Calling Implementation Guidance (Streaming vs Non-Streaming)

### 1. OpenAI API

**Documentation**: [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)

#### Non-Streaming

- **Response Structure**: `response.choices[0].message.tool_calls`
- **Behavior**: Returns a list of `ToolCall` objects. Each has an `id`, `type` (usually 'function'), and `function` object with `name` and `arguments` (JSON string).
- **Caveats**: `arguments` is a string that _must_ be parsed as JSON. It effectively arrives complete.

#### Streaming

- **Response Structure**: `chunk.choices[0].delta.tool_calls`
- **Behavior**:
  - Returns a list of `ToolCallChunk` objects.
  - **Accumulation Strategy**: You MUST accumulate `arguments` strings based on the `index`.
  - `id` and `function.name` typically arrive in the _first_ chunk for a specific `index`.
  - Subsequent chunks contain `arguments` deltas (partial strings).
- **Implementation Pattern**:
  ```python
  tool_calls_buffer = {} # Map index -> {id, name, args_accumulator}
  for chunk in stream:
      if chunk.choices[0].delta.tool_calls:
          for tc in chunk.choices[0].delta.tool_calls:
              if tc.index not in tool_calls_buffer:
                  tool_calls_buffer[tc.index] = {"id": tc.id, "name": tc.function.name, "args": ""}
              if tc.function.arguments:
                  tool_calls_buffer[tc.index]["args"] += tc.function.arguments
  ```

### 2. Google Gemini API (Vertex AI / Google AI Studio)

**Documentation**: [Gemini Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)

#### Non-Streaming

- **Response Structure**: `response.candidates[0].content.parts`
- **Behavior**: Look for a part where `part.function_call` is present.
- **Caveats**: Gemini returns structured objects (protobuf/Map), not just JSON strings. The `args` are often already parsed into a dictionary/map structure, unlike OpenAI's raw string.

#### Streaming

- **Response Structure**: `chunk.candidates[0].content.parts`
- **Behavior**:
  - Iterate through `response` chunks.
  - Check if `chunk.candidates[0].content.parts` contains a `function_call`.
  - **Critical Difference**: Unlike OpenAI, Gemini often delivers the _entire_ function call (name + args) in a single "part" within a chunk, rather than streaming arguments character-by-character.
  - **Issue #1092 Note**: There are reports/discussions (e.g., `googleapis/python-genai` Issue #1092) indicating that function call arguments might _not_ be streamed incrementally (token by token) but arrive as a block. Developers should be prepared for "burst\" arrival of function calls rather than smooth deltas.
  - **Legacy**: Older implementations (PaLM) used different fields. Ensure you are using the modern `generative-ai` or `vertexai` SDKs targeting Gemini 1.5/Pro models.

### Summary of Key Differences

| Feature             | OpenAI                          | Gemini                                          |
| :------------------ | :------------------------------ | :---------------------------------------------- |
| **Field Name**      | `tool_calls`                    | `function_call` (in `parts`)                    |
| **Argument Format** | JSON String (needs parsing)     | Structured Object / Map (often pre-parsed)      |
| **Streaming Args**  | Yes (deltas/partial strings)    | Often No (arrives as complete block in a chunk) |
| **Parallel Calls**  | Supported (via `index` in list) | Supported (multiple `function_call` parts)      |

## IPC Security (2026-02-02)

- `file:read` now resolves paths via `PathValidator` against session->space `workDir` and rejects traversal attempts with a structured error.

## Anthropic Adapter Streaming Tool-Use Implementation (2026-02-02)

### Implementation Summary

Successfully implemented streaming tool-use handling in `AnthropicAdapter.streamMessage()`:

1. **SSE Event Handling**:
   - `content_block_start`: Detects new tool_use blocks, captures `id` and `name`
   - `content_block_delta` with `input_json_delta`: Accumulates partial JSON string
   - `content_block_stop`: Parses accumulated JSON to get tool arguments
   - `message_delta`: Captures `stop_reason` to determine if tool execution needed
   - `message_stop`: Emits done:true only if stop_reason != 'tool_use'

2. **Tool Execution Loop**:
   - Outer loop with max 10 iterations (matches sendMessage)
   - Inner retry loop with exponential backoff (existing pattern)
   - Uses `ToolExecutionService` for tool execution (aligns with existing service)
   - Appends assistant content + tool_result blocks for next iteration

3. **Key Integration Points**:
   - `toolExecutionService.registerBrowserTools(allTools)` - register browser tools
   - `toolExecutionService.executeToolCalls(toolCalls, context)` - execute tool batch
   - `browserViewManager.getWebContents(viewId)` - get browser context

### Testing Considerations

- - Added mock for `tool-execution.service` module in `adapter.test.ts`
- LoggerService in ToolExecutionService uses Electron's `app.getPath` which requires mocking in test environment
- New test case validates full streaming tool-use flow with SSE event simulation

## OpenAI Adapter Tool Loop Implementation (2026-02-02)

### Implementation Summary

Added tool loop support to `OpenAIAdapter` for both `sendMessage()` and `streamMessage()`:

1. **Type System Considerations**:
   - OpenAI SDK types `ChatCompletionMessageToolCall` as a union: `ChatCompletionMessageFunctionToolCall | ChatCompletionMessageCustomToolCall`
   - Must use `ChatCompletionMessageFunctionToolCall` directly and filter with `isFunctionToolCall()` type guard
   - Custom tool calls don't have a `function` property, so type narrowing is essential

2. **Tool Definition Mapping**:
   - `getOpenAITools()` maps `ToolExecutionService.getToolDefinitions()` to OpenAI's `ChatCompletionTool[]` format
   - OpenAI expects `{ type: 'function', function: { name, description, parameters } }` structure

3. **sendMessage Tool Loop**:
   - Outer loop: max 10 iterations (MAX_TOOL_ITERATIONS)
   - Inner loop: retry with exponential backoff (existing pattern)
   - Check `finish_reason === 'tool_calls'` to detect tool invocation
   - Parse JSON arguments from `tc.function.arguments` string
   - Append assistant message with `tool_calls` array + tool result messages with `role: 'tool'`

4. **streamMessage Delta Accumulation**:
   - Streaming tool calls delivered via `delta.tool_calls` array
   - Each delta has an `index` for identifying which tool call to accumulate
   - First chunk for an index contains `id` and `function.name`
   - Subsequent chunks contain `function.arguments` partial strings
   - Accumulate in `Map<number, StreamingToolCall>` until `finish_reason === 'tool_calls'`
   - Then parse accumulated JSON and execute tools

### Testing Approach

- Mocked dependencies: `openai`, `ai-browser`, `browser-view.service`, `tool-execution.service`
- Added tests for tool call handling in both sendMessage and streamMessage
- Simulated streaming deltas for argument accumulation test

## Gemini Adapter Tool Loop Implementation (2026-02-02)

### Implementation Summary

Added tool loop support to `GeminiAdapter` for both `sendMessage()` and `streamMessage()`:

1. **Type System Considerations**:
   - Gemini SDK uses `FunctionDeclarationsTool` wrapper containing `functionDeclarations` array
   - Parameters schema type mismatch requires `as FunctionDeclarationsTool[]` assertion
   - Function calls appear in `candidates[0].content.parts` as `{ functionCall: { name, args } }`
   - Args are **already structured objects**, not JSON strings (unlike OpenAI)

2. **Tool Definition Mapping**:
   - `getGeminiTools()` maps `allTools` from ai-browser to Gemini's format
   - Single `FunctionDeclarationsTool` object containing all declarations
   - Tools passed to `getGenerativeModel({ model, tools })` constructor

3. **sendMessage Tool Loop**:
   - Outer loop: max 10 iterations (MAX_TOOL_ITERATIONS)
   - Inner loop: retry with exponential backoff (existing pattern)
   - `hasFunctionCalls(parts)` checks for `functionCall` in response parts
   - `extractFunctionCalls(parts)` builds ToolCall[] with generated IDs
   - Conversation history managed as `Content[]` with role 'user'/'model'
   - Function responses sent as `{ functionResponse: { name, response } }` parts

4. **streamMessage Behavior**:
   - Gemini often delivers complete function calls in a single chunk (not deltas)
   - Accumulate `functionCall` parts during stream iteration
   - Check for function calls after stream completes
   - Same conversation history pattern as sendMessage

### Key Differences from Other Adapters

| Feature             | Anthropic                   | OpenAI                        | Gemini                         |
| :------------------ | :-------------------------- | :---------------------------- | :----------------------------- |
| **Field Name**      | `tool_use` blocks           | `tool_calls` array            | `functionCall` in parts        |
| **Argument Format** | JSON string (needs parsing) | JSON string (needs parsing)   | Structured object (pre-parsed) |
| **Streaming Args**  | Deltas (`input_json_delta`) | Deltas (`function.arguments`) | Complete block in single chunk |
| **Response Format** | `tool_result` blocks        | `role: 'tool'` messages       | `functionResponse` parts       |

### Testing Approach

- Mocked dependencies: `@google/generative-ai`, `ai-browser`, `browser-view.service`, `tool-execution.service`
- Added tests for tool call handling in both sendMessage and streamMessage
- Mock responses include `candidates[0].content.parts` structure with functionCall objects

## SmartRouter Integration in Message Handler (2026-02-02)

### Implementation Summary

Integrated `SmartRouter` into `handleMessageSend` IPC handler:

1. **Routing Strategy Selection**:
   - `router.analyzeTask(content)` returns 'direct', 'delegate', or 'workforce'
   - Default rules route frontend/backend/architecture patterns to delegate, complex creation to workforce

2. **Strategy-specific Handling**:
   - **Direct**: Preserves existing streaming via `adapter.streamMessage()`, emits incremental chunks
   - **Delegate/Workforce**: Calls `router.route()`, extracts output, emits single chunk with `done:true`

3. **RouteResult Type Discrimination**:
   - `DirectRouteResult`: has `strategy: 'direct'` and `output`
   - `DelegateTaskResult`: has `taskId` and `output`
   - `WorkflowResult`: has `workflowId` and `results` (Map) - joined with separator

4. **UI Consistency**:
   - All strategies emit `message:stream-chunk` events with `{content, done}` shape
   - DB persistence happens after response completion for all paths

## ChatView Implementation (2026-02-02)

- **IPC Pattern**: Successfully replicated the `ChatPage.tsx` IPC pattern in `ChatView.tsx`.
- **Session Management**: `session:get-or-create-default` ensures a session exists on mount.
- **Message List**: `message:list` retrieves history, and `message:stream-chunk` handles real-time updates.
- **Typing**: Added strict typing for `Message` object to match the component props.
- **UI Consistency**: Reused `MessageList` and `MessageInput` components to maintain visual consistency with the rest of the app.

## Unified ArtifactRail Component (2026-02-02)

- **Component Unification**: Replaced stub `ArtifactRail` in `src/renderer/src/components/layout/MainLayout.tsx` with the real implementation from `src/renderer/src/components/artifact/ArtifactRail.tsx`.
- **State Management**: Created `useArtifactStore` (Zustand) to manage artifact list and selection state across components, enabling separation of List (Rail) and Preview (Canvas).
- **Separation of Concerns**: Refactored `ArtifactRail` to handle only the file list and moved preview logic to `ContentCanvas`.
- **Import Fixes**: Updated imports in `MainLayout.tsx` to point to the correct component path.
- **Type Safety**: Fixed `Artifact` type usage in `ContentCanvas` to safely handle file names and types.

## Routing and UI Integration Analysis (2026-02-02)

### 1. Application Entry & Routing

- **Active Routes**: `src/renderer/src/App.tsx` defines only two routes:
  - `/` -> `MainLayout`
  - `/settings` -> `SettingsPage`
- **Orphaned Page**: `src/renderer/src/pages/ChatPage.tsx` is **not routed**. It is unused in the current application flow.

### 2. Component Reachability

- **ChatView (Active)**:
  - Located at `src/renderer/src/components/layout/ChatView.tsx`.
  - Mounted by `MainLayout`.
  - **Missing Features**: Does NOT integrate `WorkflowView` or any workflow visualization toggles.
- **ChatPage (Inactive)**:
  - Located at `src/renderer/src/pages/ChatPage.tsx`.
  - Contains the logic to toggle between "Chat" and "Workflow" views.
  - Correctly imports and attempts to render `<WorkflowView />`.
  - **Status**: Dead code (unreachable).

- **WorkflowView (Unreachable)**:
  - Located at `src/renderer/src/components/workflow/WorkflowView.tsx`.
  - Only imported by the inactive `ChatPage.tsx`.
  - **Result**: Users cannot see the Workflow DAG in the current application.

- **AgentWorkViewer (Orphaned)**:
  - Located at `src/renderer/src/components/agents/AgentWorkViewer.tsx`.
  - **Usage**: Zero imports found in the codebase (grep confirmed).
  - **Status**: Dead code.

### 3. Integration Gap

The features intended for the "Smart" Chat interface (Workflow visualization, etc.) are trapped in the unrouted `ChatPage`, while the active `ChatView` remains a simpler implementation. To enable Workflow visualization, we must either:

1. Replace `ChatView` usage with `ChatPage` in `MainLayout`.
2. Or migrate the `WorkflowView` integration logic from `ChatPage` into `ChatView`.

## Audit Logging Verification (2026-02-02)

- `src/main/ipc/handlers/artifact.ts` already logs audit events for `file:read` and `shell:open-path`.
  - `file:read` logs on session missing, path traversal, not found, success, and error (lines 32-88).
  - `shell:open-path` logs on success and error (lines 96-112).

## Workflow Event & IPC Inspection Findings

- **WorkflowEventEmitter**: Exists in `src/main/services/workforce/events.ts` but is **dormant**. It is not imported or used in `WorkforceEngine` or `DelegateEngine`.
- **task:status-changed**: Defined in types but **never emitted** from the main process. The renderer listens for it, but it will never fire.
- **task:list**: Implemented in `src/main/ipc/handlers/task.ts`.
- **agent:list**: NOT implemented in `src/main/ipc/index.ts`. The renderer has a commented-out call to it.
- **Agent Definitions**: Static definitions exist in `src/main/services/delegate/agents.ts` but are not exposed via IPC.
- **Gap Analysis**: To enable real-time UI updates, we need to inject `workflowEvents.emit` into `WorkforceEngine` and `DelegateEngine`, and hook up a listener in `main/index.ts` (or similar) to forward these events to the renderer via IPC.

## Task 3 Verification: ToolExecutionService (2026-02-02)

### Status: ALREADY IMPLEMENTED

The unified `ToolExecutionService` was already fully implemented in a prior task.

**Files:**

- Implementation: `src/main/services/tools/tool-execution.service.ts` (362 lines)
- Tests: `tests/unit/services/tools/tool-execution.service.test.ts` (330 lines, 17 tests)

**Features Verified:**

1. ✅ Unified `Tool` and `BrowserTool` interface support via `UnifiedTool` type
2. ✅ Tool execution loop (`createLoopExecutor` with iteration tracking)
3. ✅ Timeout control (`executeWithTimeout` with configurable `timeoutMs`)
4. ✅ Error handling (`stopOnError` option, graceful failure capture)
5. ✅ Permission policy integration (`defaultPolicy.isAllowed`)
6. ✅ ToolRegistry integration for non-browser tools
7. ✅ LLM result formatting (`formatResultsForLLM`)

**Integration Points:**

- `anthropic.adapter.ts` (line 350-387): Uses `toolExecutionService.executeToolCalls()`
- Singleton export: `toolExecutionService` ready for import

**Test Results:** All 17 tests pass. No TypeScript errors.

- **Renderer shim gap**: Renderer expects `task:status-changed` via `window.codeall.on`, but main process never sends it.
- **Missing IPCs**: `agent:list` and `agent:status` are completely missing from both main IPC registration and renderer shims (except for a commented-out `agent:list` call).
- **Correct Path**: Events should flow: `WorkforceEngine` -> `WorkflowEventEmitter` -> `Main Process IPC` -> `Renderer Window`.

## IPC Path Validation Update (2026-02-02)

- `file:read` handler now explicitly checks `PathValidator.isPathSafe` against `workDir` before resolving, returning `{ success: false, error: 'Path traversal detected' }` on boundary violations while keeping audit logging consistent.
- **Renderer shim**: `message:stream-chunk` is handled in `src/main/ipc/handlers/message.ts`.
- **task:status-changed**: Not handled anywhere.
- **IPC Strategy**:
  1.  **WorkforceEngine** and **DelegateEngine** need to import `workflowEvents` from `src/main/services/workforce/events.ts`.
  2.  They should emit `task:status-changed` when tasks are created, updated, or completed.
  3.  We need a central place to listen to these events and broadcast them to the renderer. `src/main/ipc/index.ts` or a new `src/main/ipc/events.ts` is a good place.
  4.  We need to register `agent:list` and `agent:status` handlers.

## Electron Auto-Update Configuration Research (2026-02-02)

### 1. Configuration Patterns

#### A. The "Baked-In" Approach (Recommended)

Configure the update URL at **build time** using `electron-builder.yml`. This generates an `app-update.yml` file inside the packaged app (`resources/app-update.yml`), which `electron-updater` reads automatically.

**Pros:**

- No hardcoded URLs in source code.
- Different URLs for different environments (Staging/Prod) via CI environment variables.
- Cleaner `main/index.ts` (no `setFeedURL` needed).

**Configuration (`electron-builder.yml`):**

```yaml
publish:
  provider: generic
  # Use environment variable expansion at build time
  url: '${env.UPDATE_FEED_URL}'
  # Optional: Request headers if needed (e.g. for private S3/server)
  # channel: latest
```

**CI/Build Command:**

```bash
# Ensure the variable is set during the build process
export UPDATE_FEED_URL="https://updates.codeall.com/release/stable"
npm run build:win
```

#### B. The "Runtime" Approach

Configure the URL at **runtime** in `src/main/index.ts`.

**Pros:**

- Can change based on user settings or dynamic logic.
- Easier to test in development without rebuilding.

**Configuration (`src/main/index.ts`):**

```typescript
autoUpdater.setFeedURL({
  provider: 'generic',
  url: process.env.UPDATE_URL || 'https://fallback.com'
})
```

### 2. Required Fields by Provider

| Provider    | Required Fields in `electron-builder.yml`                     | Notes                                                                                |
| :---------- | :------------------------------------------------------------ | :----------------------------------------------------------------------------------- |
| **Generic** | `provider: "generic"`<br>`url: "https://..."`                 | Simplest. Requires you to upload `latest.yml` + artifacts manually or via CI script. |
| **GitHub**  | `provider: "github"`<br>`owner: "org"`<br>`repo: "name"`      | `token` (GH_TOKEN) required in env for private repos or rate limit avoidance.        |
| **S3**      | `provider: "s3"`<br>`bucket: "name"`<br>`region: "us-east-1"` | Requires AWS credentials in build env.                                               |

### 3. Pitfalls & Safe Defaults

#### Disabling in Development

The `electron-updater` process tries to read `app-update.yml` which doesn't exist in dev (or points to a non-existent dev path).

**Pitfall:** calling `checkForUpdates()` in dev will often throw an error or log "Skip... not packed".

**Safe Pattern (`src/main/index.ts`):**

```typescript
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

// 1. Only check if packaged
if (app.isPackaged) {
  autoUpdater.checkForUpdates()
} else {
  // Optional: Enable debugging in dev if needed
  // autoUpdater.forceDevUpdateConfig = true;
  console.log('[Updater] Skipping auto-update in dev mode')
}

// 2. Logging is crucial for debugging user issues
autoUpdater.logger = console // Or your logger instance
```

#### Environment Variable Expansion

- **Syntax:** `${env.VAR_NAME}` in `electron-builder.yml`.
- **Constraint:** The variable must be present in the **shell/environment** where `electron-builder` runs. It does NOT automatically read `.env` files unless you use a wrapper like `dotenv-cli` or `cross-env`.

### 4. Authoritative Sources

- [Electron Builder: Publish Configuration](https://www.electron.build/configuration/publish)
- [Electron Builder: Auto Update](https://www.electron.build/auto-update)
- [Electron Updater Class Docs](https://www.electron.build/auto-update#appupdater)

## Task 4 Verification: AnthropicAdapter Streaming Tool Call Support (2026-02-02)

### Status: ALREADY IMPLEMENTED

Streaming tool call support in `AnthropicAdapter.streamMessage()` was already fully implemented.

**File:** `src/main/services/llm/anthropic.adapter.ts` (lines 189-393)

**Implementation Details:**

1. **SSE Event Handling** (lines 246-323):
   - `content_block_start`: Detects `tool_use` blocks, captures `id` and `name`
   - `content_block_delta` with `input_json_delta`: Accumulates partial JSON string
   - `content_block_stop`: Parses accumulated JSON to get tool arguments
   - `message_delta`: Captures `stop_reason` to determine if tool execution needed
   - `message_stop`: Emits `done:true` only if `stop_reason !== 'tool_use'`

2. **State Management** (lines 230-235):
   - `toolUseBlocks`: Array accumulating `{id, name, inputJson}` per block index
   - `currentBlockIndex` and `currentBlockType`: Track current block being processed
   - `stopReason`: Captured from `message_delta` event
   - `contentBlocks`: Final parsed tool blocks for conversation history

3. **Tool Execution Loop** (lines 340-388):
   - Uses `ToolExecutionService.executeToolCalls()` for unified tool execution
   - Appends assistant content + tool results for next iteration
   - Max 10 iterations (matches `sendMessage` pattern)

4. **Test Coverage** (line 173 in adapter.test.ts):
   - Test simulates full streaming tool-use flow
   - Validates partial JSON accumulation (`input_json_delta`)
   - Verifies tool execution and continuation

**Verification:**

- ✅ LSP Diagnostics: No TypeScript errors
- ✅ Tests: All 10 tests pass in `adapter.test.ts`

## Task 6 Verification: GeminiAdapter Tool Call Loop (2026-02-02)

### Status: ALREADY IMPLEMENTED

The GeminiAdapter tool call loop support was already fully implemented.

**File:** `src/main/services/llm/gemini.adapter.ts` (297 lines)

### sendMessage() Tool Loop (lines 101-195)

1. ✅ Outer loop with MAX_TOOL_ITERATIONS = 10 (line 113)
2. ✅ Inner retry loop with exponential backoff (lines 114-190)
3. ✅ Uses `toolExecutionService.registerBrowserTools(allTools)` (line 106)
4. ✅ `hasFunctionCalls(parts)` detection (line 141)
5. ✅ `extractFunctionCalls(parts)` extracts ToolCall[] (line 145)
6. ✅ `toolExecutionService.executeToolCalls()` execution (line 157)
7. ✅ `buildFunctionResponseParts(outputs)` for response (line 165)
8. ✅ Conversation history updated for next iteration (lines 167-176)

### streamMessage() Tool Loop (lines 197-295)

1. ✅ Outer loop with MAX_TOOL_ITERATIONS = 10 (line 207)
2. ✅ Inner retry loop with exponential backoff
3. ✅ Accumulates `functionCall` parts during streaming (lines 232-234)
4. ✅ Same tool execution and history management pattern

### Gemini-Specific Handling

- **Args as structured objects**: Line 47 casts `args as Record<string, unknown>` (Gemini returns pre-parsed objects, not JSON strings)
- **Function responses**: Use `{ functionResponse: { name, response } }` format (lines 59-68)
- **Streaming behavior**: Gemini delivers complete function calls in single chunks (not deltas)

### Test Results

All 6 tests pass:

- `should send message with history`
- `should stream message chunks`
- `should retry on failure`
- `should handle timeout`
- `should handle tool calls in sendMessage`
- `should handle tool calls in streamMessage`

No TypeScript diagnostics errors.

## Task 5 Verification: OpenAI Adapter Tool Call Loop (2026-02-02)

### Status: ALREADY IMPLEMENTED

The tool call loop support was already fully implemented in `OpenAIAdapter` for both `sendMessage()` and `streamMessage()`.

**File:** `src/main/services/llm/openai.adapter.ts` (376 lines)

### sendMessage Implementation (lines 86-198)

1. **Tool Definition Mapping** (lines 32-42):
   - `getOpenAITools()` maps `toolExecutionService.getToolDefinitions()` to OpenAI's `ChatCompletionTool[]` format
   - Structure: `{ type: 'function', function: { name, description, parameters } }`

2. **Tool Loop**:
   - Outer loop: `MAX_TOOL_ITERATIONS = 10` (line 97)
   - Inner loop: Retry with exponential backoff (existing pattern, lines 98-191)
   - Detection: `finish_reason === 'tool_calls'` (line 129)
   - Parsing: `parseToolCalls()` extracts id, name, and JSON-parsed arguments (lines 44-63)
   - Execution: `toolExecutionService.executeToolCalls(parsedToolCalls, context)` (lines 149-152)

3. **Message Accumulation**:
   - Appends assistant message with `tool_calls` array (lines 161-168)
   - Appends tool result messages with `role: 'tool'` (lines 171-177)

### streamMessage Implementation (lines 200-374)

1. **Streaming Delta Accumulation**:
   - Uses `Map<number, StreamingToolCall>` keyed by `index` (line 227)
   - First chunk for an index contains `id` and `function.name`
   - Subsequent chunks contain `function.arguments` partial strings (lines 243-266)
   - Parses accumulated JSON after stream completes (lines 285-303)

2. **Tool Loop** (same pattern as sendMessage):
   - Detection: `finishReason === 'tool_calls'` (line 278)
   - Execution: `toolExecutionService.executeToolCalls(toolCalls, context)` (line 315)
   - Message accumulation: assistant + tool results (lines 334-351)

### Tests Verified

- **File:** `tests/unit/services/llm/openai.adapter.test.ts`
- **Result:** All 5 tests pass
  - `should send messages and return response`
  - `should stream messages`
  - `should retry on failure`
  - `should handle tool calls in sendMessage`
  - `should handle tool calls in streamMessage`

### Key Integration Points

- `toolExecutionService.getToolDefinitions()` - Get tool definitions
- `toolExecutionService.registerBrowserTools(allTools)` - Register browser tools
- `toolExecutionService.executeToolCalls(toolCalls, context)` - Execute tool batch
- `browserViewManager.getWebContents(viewId)` - Get browser context

## Task 7 Verification: SmartRouter Integration in handleMessageSend (2026-02-02)

### Status: ALREADY IMPLEMENTED

The SmartRouter integration in `handleMessageSend` was already fully implemented.

**File:** `src/main/ipc/handlers/message.ts` (144 lines)

### Implementation Evidence

| Aspect                      | Line Range    | Details                                                               |
| --------------------------- | ------------- | --------------------------------------------------------------------- |
| SmartRouter import          | Line 9        | `import { SmartRouter, type RouteResult }`                            |
| Router instantiation        | Line 53       | `new SmartRouter()`                                                   |
| Route analysis              | Line 65       | `router.analyzeTask(input.content)` → 'direct'/'delegate'/'workforce' |
| Direct strategy (streaming) | Lines 69-102  | `adapter.streamMessage()` with incremental `message:stream-chunk`     |
| Non-direct strategies       | Lines 103-113 | `router.route()` + single `message:stream-chunk` with `done:true`     |
| extractRouteOutput helper   | Lines 34-45   | Handles DirectRouteResult, DelegateTaskResult, WorkflowResult         |

### Streaming Behavior Preserved

1. **Direct strategy**: Uses existing streaming loop, emits incremental chunks
2. **Delegate/Workforce**: Calls `router.route()`, emits single chunk with `done: true`
3. **Consistent payload shape**: All strategies emit `{content, done}` via `message:stream-chunk`

### RouteResult Type Discrimination

```typescript
function extractRouteOutput(result: RouteResult): string {
  if ('strategy' in result && result.strategy === 'direct') return result.output
  if ('taskId' in result) return result.output // DelegateTaskResult
  if ('workflowId' in result) return Array.from(result.results.values()).join('\n\n---\n\n') // WorkflowResult
  return ''
}
```

### Verification Results

- ✅ Tests: All 10 tests pass in `smart-router.test.ts`
- ✅ LSP Diagnostics: No TypeScript errors
- ✅ DB persistence: Happens after response completion for all paths (lines 121-129)

### No Edits Required

Task was already implemented in prior work session.

## MainLayout Component Wiring Inspection

- Date: Mon Feb 2 12:02:03 CST 2026
- Target: `src/renderer/src/components/layout/MainLayout.tsx`

### Current Import State

- ArtifactRail is imported from: `../artifact/ArtifactRail`
- ContentCanvas is imported from: `../canvas/ContentCanvas`

### Implementation Verification

- `src/renderer/src/components/artifact/ArtifactRail.tsx` exists and is a real component (uses useArtifactStore, renders FileTree).
- `src/renderer/src/components/canvas/ContentCanvas.tsx` exists and is a real component (uses useCanvasLifecycle, renders BrowserViewer/CodePreview).

### Layout Directory Status

- No stub files found in `src/renderer/src/components/layout/` (only ChatView.tsx, MainLayout.tsx, Sidebar.tsx, TopNavigation.tsx).
- This contradicts the initial assumption that layout stubs might still be used.

### Conclusion for Task 9/10

- The imports in MainLayout.tsx are ALREADY correct relative to the file structure.
- `MainLayout.tsx` is in `src/renderer/src/components/layout/`
- `ArtifactRail.tsx` is in `src/renderer/src/components/artifact/`
- Import `../artifact/ArtifactRail` resolves to `src/renderer/src/components/artifact/ArtifactRail.tsx` which is correct.
- Import `../canvas/ContentCanvas` resolves to `src/renderer/src/components/canvas/ContentCanvas.tsx` which is correct.

### Action Plan Adjustment

- Tasks 9 and 10 may be redundant or purely verification if the code is already correct.
- If the app is failing to load these components, the issue might be in the export statements or circular dependencies, not the file paths.
- MainLayout.tsx lines 4 and 5 are the critical import lines.

## UI Component Integration Analysis (Task 11)

### WorkflowView.tsx

- **Data Source**: Direct IPC calls.
- **Initial Load**: Calls `window.codeall.invoke('task:list', sessionId)` (Line 114).
- **Real-time Updates**: Listens to `task:status-changed` (Line 150).
- **Gap Confirmation**: The component is fully implemented to handle `task:status-changed`, reinforcing the need to implement this emission in the Main process (Task 12).

### AgentWorkViewer.tsx

- **Data Source**: Indirect, via `useAgentStore` (Zustand).
- **Props**: `agentId: string`, `className?: string`.
- **Logic**: derived state from store (`agents`, `workLogs`).
- **Missing Link**: The component does not fetch data itself. It relies on external mechanisms (likely other IPC listeners or polling) to update the global agent store. If the store isn't updated by the backend, this view will remain empty or static.

### ChatPage.tsx

- **Role**: Container/Orchestrator.
- **State**: Manages `sessionId` (for WorkflowView) and `selectedAgentId` (for AgentWorkViewer).
- **Integration**:
  - Passes `sessionId` to `WorkflowView`.
  - Passes `selectedAgentId` to `AgentWorkViewer`.

## CI/CD Infrastructure

- **Observation**: No CI/CD configuration files found.
- **Details**: Checked for `.github/workflows`, `.circleci`, `.travis.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `azure-pipelines.yml`. None exist.
- **Implication**: There is currently no automated build or testing pipeline configured in the repository.

## [2026-02-02 12:07] Electron Updater Configuration Analysis

- **Placeholder Found**: `src/main/index.ts` contains a hardcoded placeholder that overrides build configuration:
  ```typescript
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'https://example.com/updates'
  })
  ```
- **Missing Build Config**: `electron-builder.yml` has `publish: null`, meaning no `app-update.yml` is generated during build.
- **Recommendation**:
  1. Remove `autoUpdater.setFeedURL(...)` from `src/main/index.ts`.
  2. Configure `publish` in `electron-builder.yml` (e.g., to S3, GitHub, or generic server) to let `electron-updater` automatically pick up the configuration.

## CI Workflow (2026-02-02)

- Added a minimal GitHub Actions CI that uses pnpm + Node 20, installs dependencies, and conditionally runs typecheck/test/build/e2e based on existing scripts.
- Playwright browsers are installed only when `test:e2e` exists, and e2e runs under `xvfb-run` on ubuntu-latest.

## Learnings from Task: Correct Project Status Claims (2026-02-02)\n\n### Patterns\n\n- **README Accuracy**: It is critical to keep README status lines synchronized with actual project state. Over-promising (e.g., \"Production Ready\", \"All tasks complete\") in a repository under active development can mislead users and contributors.\n- **Conservative Wording**: Using terms like \"Beta\", \"Active Development\", and \"Roadmap\" provides a more accurate representation of projects that are still evolving.\n\n### Technical Debt Identified\n\n- **Dangling References**: The README previously linked to a `PROJECT_COMPLETE.md` and claimed all 131 tasks were finished. While the file exists, the claim of \"completion\" for the entire project was premature for the current codebase state.\n\n### Improvements\n\n- Updated `README.md` to reflect \"Beta\" status and \"Active Development\".\n- Replaced \"All tasks complete\" claim with a more accurate status pointing to the roadmap/progress file.\n\n## Learnings from Task: Troubleshooting Documentation (2026-02-02)

### Troubleshooting Common Issues

- **E2E Stability**: Confirmed that `pnpm build` must precede `pnpm test:e2e` to ensure the Electron executable is available for Playwright, preventing "Process failed to launch" errors.
- **Linux E2E Environment**: Documented the requirement for `xvfb-run` and system dependencies (`npx playwright install-deps`) when running Electron tests in headless/CI Linux environments.
- **Auto-Updater Pipeline**: Verified that `CODEALL_UPDATE_URL` must be baked into the build environment to correctly generate the `app-update.yml` used by `electron-updater`.
- **API Key Management**: Clarified that 401/Authentication errors in the chat interface are typically due to missing or misconfigured API keys in the application settings.

## Gemini Test Mock Update (2026-02-02)

### Issue

Gemini integration tests in `tests/integration/llm-providers.test.ts` were failing because mocks used outdated response structure.

### Root Cause

- **Old mock format**: `{ response: { text: () => 'content', usageMetadata: {...} } }`
- **Adapter expects**: `{ response: { candidates: [{ content: { parts: [{ text: 'content' }] } }], usageMetadata: {...} } }`

The Gemini adapter was updated (likely in a prior task adding tool loop support) to use `candidates[0].content.parts` structure for extracting text, but the test mocks were not updated to match.

### Fix

Updated both mock locations:

1. Line 180-185: First test case mock ("Hello from Gemini")
2. Line 212-217: Smart Router test mock ("Gemini response")

## E2E Test Mode Flag Gap (2026-02-02)

### Finding

- `CODEALL_E2E_TEST` is set in `tests/e2e/fixtures/electron.ts` but **not referenced anywhere in `src/`**.
- No mock LLM adapter or test-mode switch exists in `src/main/services/llm/factory.ts`.
- E2E chat test (`tests/e2e/chat-workflow.spec.ts`) relies on real LLM responses (no network mocking in tests/e2e).

### Impact

- There is **no built-in mock mode** for E2E/QA chat flows.
- E2E tests either hit real APIs or remain blocked in environments without Electron launch support.

Changed from using `text()` function to the proper `candidates[].content.parts[]` structure.

### Key Pattern

When adapter behavior changes (especially response parsing logic), ensure all mocks in test files reflect the new structure expected by the adapter.

## Mock LLM Adapter for QA (2026-02-02)

### Pattern

- Added a `MockLLMAdapter` for test-mode usage with deterministic responses.
- Factory now returns mock adapter when `CODEALL_E2E_TEST=1`.

### Tool Call Simulation

- Mock adapter triggers a `file_list` tool execution when the user message includes `tool:`.
- Uses `toolExecutionService.executeTool` with a minimal `ToolExecutionContext`.

## Chat IPC Verification (2026-02-02)

- Added `tests/integration/chat-ipc.test.ts` to verify `handleMessageSend` streams chunks and includes tool execution results under `CODEALL_E2E_TEST=1`.
- Verified `pnpm test:e2e tests/e2e/chat-workflow.spec.ts` exits with success but skips in WSL.
- Dev server responds on `http://localhost:5173` (HTML returned).
