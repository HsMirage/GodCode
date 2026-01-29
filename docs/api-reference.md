# CodeAll API Reference

This document details the Inter-Process Communication (IPC) API and the Database Schema used in CodeAll.

## 1. IPC Channels

The Renderer process communicates with the Main process via `window.electron.ipcRenderer.invoke(channel, ...args)`.

### 1.1 Space Management

| Channel | Input | Return | Description |
|Args|`{ name: string, workDir: string }`|`{ success: boolean, data?: Space }`|Create a new workspace|
|`space:list`|None|`{ success: boolean, data: Space[] }`|List all available spaces|
|`space:get`|`spaceId: string`|`{ success: boolean, data: Space }`|Get details of a specific space|
|`space:delete`|`spaceId: string`|`{ success: boolean }`|Delete a workspace|
|`space:update`|`spaceId, { name?, workDir? }`|`{ success: boolean, data: Space }`|Update space details|
|`dialog:select-folder`|None|`{ success: boolean, data: string }`|Open native folder selection dialog|

### 1.2 Session Management

| Channel                         | Input                                 | Return      | Description                     |
| ------------------------------- | ------------------------------------- | ----------- | ------------------------------- |
| `session:create`                | `{ spaceId: string, title?: string }` | `Session`   | Create a new chat session       |
| `session:get-or-create-default` | `{ spaceId?: string }`                | `Session`   | Get default session for a space |
| `session:get`                   | `sessionId: string`                   | `Session`   | Get session details             |
| `session:list`                  | None                                  | `Session[]` | List all sessions               |

### 1.3 Message System

| Channel        | Input                    | Return      | Description                     |
| -------------- | ------------------------ | ----------- | ------------------------------- |
| `message:send` | `{ sessionId, content }` | `Message`   | Send user message to LLM        |
| `message:list` | `sessionId: string`      | `Message[]` | Get message history for session |

**Events:**

- `message:stream-chunk`: Emitted during LLM streaming.
  ```typescript
  // Listener in Renderer
  ipcRenderer.on('message:stream-chunk', (_, { content, done }) => {
    console.log(content)
  })
  ```

### 1.4 Model Management

| Channel        | Input                                  | Return    | Description                      |
| -------------- | -------------------------------------- | --------- | -------------------------------- |
| `model:create` | `{ provider, modelName, apiKey, ... }` | `Model`   | Register a new LLM configuration |
| `model:list`   | None                                   | `Model[]` | List configured models           |
| `model:update` | `{ id, data }`                         | `Model`   | Update model configuration       |
| `model:delete` | `id: string`                           | `Model`   | Delete a model configuration     |

### 1.5 Browser Automation

| Channel              | Input              | Return                            | Description                   |
| -------------------- | ------------------ | --------------------------------- | ----------------------------- |
| `browser:create`     | `{ viewId, url }`  | `{ success: boolean }`            | Create a new BrowserView      |
| `browser:navigate`   | `{ viewId, url }`  | `{ success: boolean }`            | Navigate to a URL             |
| `browser:click`      | `{ viewId, x, y }` | `{ success: boolean }`            | Simulate click event          |
| `browser:type`       | `{ viewId, text }` | `{ success: boolean }`            | Simulate keyboard input       |
| `browser:capture`    | `{ viewId }`       | `{ success: true, data: string }` | Capture screenshot (Data URL) |
| `browser:execute-js` | `{ viewId, code }` | `{ success: true, data: any }`    | Execute JavaScript in page    |

## 2. Database Schema

CodeAll uses **Prisma** with **PostgreSQL**.

### 2.1 Core Models

#### Space

```prisma
model Space {
  id        String    @id @default(uuid())
  name      String
  workDir   String    // Local file system path
  createdAt DateTime
  updatedAt DateTime
  sessions  Session[]
}
```

#### Session

```prisma
model Session {
  id        String     @id @default(uuid())
  spaceId   String
  title     String
  status    String     @default("active")
  messages  Message[]
  tasks     Task[]
  artifacts Artifact[]
}
```

#### Message

```prisma
model Message {
  id        String   @id @default(uuid())
  sessionId String
  role      String   // "user" | "assistant"
  content   String   @db.Text
  metadata  Json?
}
```

#### Task (Workforce Engine)

```prisma
model Task {
  id            String   @id @default(uuid())
  sessionId     String
  type          String   // "plan", "code", "review"
  status        String   // "pending", "running", "completed"
  input         String
  output        String?
  assignedModel String?
}
```

#### Artifact

```prisma
model Artifact {
  id        String   @id @default(uuid())
  sessionId String
  type      String   // "file", "diff", "command"
  path      String
  content   String?
}
```

## 3. Usage Examples

### Sending a Message (Renderer)

```typescript
import { ipcRenderer } from 'electron'

async function sendMessage(sessionId: string, text: string) {
  // 1. Send request
  const response = await ipcRenderer.invoke('message:send', {
    sessionId,
    content: text
  })

  // 2. Listen for stream
  ipcRenderer.on('message:stream-chunk', (_, chunk) => {
    if (!chunk.done) {
      updateUI(chunk.content)
    }
  })

  return response
}
```

### Creating a Space

```typescript
const createNewSpace = async () => {
  // 1. Open folder dialog
  const { data: path } = await ipcRenderer.invoke('dialog:select-folder')

  if (path) {
    // 2. Create space record
    await ipcRenderer.invoke('space:create', {
      name: 'My New Project',
      workDir: path
    })
  }
}
```
