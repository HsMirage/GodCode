# GodCode API 接口文档

本文档详细记录 GodCode 应用的所有 IPC API 接口，供开发者和插件作者参考。

## 目录

- [概述](#概述)
- [会话管理 API](#会话管理-api)
- [消息 API](#消息-api)
- [空间管理 API](#空间管理-api)
- [模型配置 API](#模型配置-api)
- [任务管理 API](#任务管理-api)
- [Agent 绑定 API](#agent-绑定-api)
- [密钥管理 API](#密钥管理-api)
- [Artifact API](#artifact-api)
- [浏览器控制 API](#浏览器控制-api)
- [系统设置 API](#系统设置-api)
- [流式事件 API](#流式事件-api)
- [会话恢复 API](#会话恢复-api)
- [数据库 Schema](#数据库-schema)

---

## 概述

### 通信模式

GodCode 使用 Electron IPC 进行进程间通信，分为两种模式:

1. **Invoke Channels** (请求-响应模式)
   - 方向: Renderer → Main
   - 使用: `ipcRenderer.invoke()` / `ipcMain.handle()`
   - 返回: Promise

2. **Event Channels** (单向事件模式)
   - 方向: Main → Renderer
   - 使用: `webContents.send()` / `ipcRenderer.on()`
   - 用途: 实时通知、流式数据

### 调用方式

在 Renderer 进程中:

```typescript
// 通过 preload 暴露的 API 调用
const result = await window.electron.ipcRenderer.invoke('channel-name', params)

// 监听事件
window.electron.ipcRenderer.on('event-name', (event, data) => {
  // 处理事件
})
```

### 通用响应格式

大多数 API 返回统一的响应格式:

```typescript
// 成功
{ success: true, data: T }

// 失败
{ success: false, error: string }
```

部分 API 直接返回数据对象或抛出错误。

---

## 会话管理 API

管理聊天会话的生命周期。

### session:create

创建新的聊天会话。

| 属性 | 值 |
|------|-----|
| 通道 | `session:create` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  spaceId: string      // 所属空间 ID
  title?: string       // 会话标题 (默认: "New Chat")
}
```

**返回**:
```typescript
Session {
  id: string
  spaceId: string
  title: string
  status: string
  createdAt: Date
  updatedAt: Date
}
```

**示例**:
```typescript
const session = await ipcRenderer.invoke('session:create', {
  spaceId: 'space-123',
  title: '重构认证模块'
})
```

---

### session:list

获取会话列表。

| 属性 | 值 |
|------|-----|
| 通道 | `session:list` |
| 方向 | Renderer → Main |

**参数**:
```typescript
spaceId?: string  // 可选，筛选特定空间的会话
```

**返回**:
```typescript
Session[]  // 按更新时间倒序排列
```

**示例**:
```typescript
// 获取所有会话
const sessions = await ipcRenderer.invoke('session:list')

// 获取特定空间的会话
const sessions = await ipcRenderer.invoke('session:list', 'space-123')
```

---

### session:get

获取单个会话详情。

| 属性 | 值 |
|------|-----|
| 通道 | `session:get` |
| 方向 | Renderer → Main |

**参数**:
```typescript
id: string  // 会话 ID
```

**返回**:
```typescript
Session
```

**错误**:
- `Session not found` - 会话不存在

---

### session:update

更新会话信息。

| 属性 | 值 |
|------|-----|
| 通道 | `session:update` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  id: string           // 会话 ID
  title?: string       // 新标题
  status?: string      // 新状态
}
```

**返回**:
```typescript
Session  // 更新后的会话
```

---

### session:delete

删除会话及其所有关联数据。

| 属性 | 值 |
|------|-----|
| 通道 | `session:delete` |
| 方向 | Renderer → Main |

**参数**:
```typescript
id: string  // 会话 ID
```

**返回**:
```typescript
void
```

**说明**: 会级联删除关联的消息、任务、Artifact 等数据。

---

### session:get-or-create-default

获取或创建默认会话。

| 属性 | 值 |
|------|-----|
| 通道 | `session:get-or-create-default` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  spaceId?: string  // 可选，指定空间
}
```

**返回**:
```typescript
Session | null
```

---

## 消息 API

处理聊天消息的发送和接收。

### message:send

发送消息并获取 AI 响应。

| 属性 | 值 |
|------|-----|
| 通道 | `message:send` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  sessionId: string    // 会话 ID
  content: string      // 消息内容
  agentCode?: string   // 可选，指定使用的 Agent
}
```

**返回**:
```typescript
Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
  metadata?: Record<string, unknown>
}
```

**说明**:
- 会自动创建用户消息和助手响应消息
- 通过 `message:stream-chunk` 事件推送流式响应
- 如果发生错误，通过 `message:stream-error` 事件通知

**示例**:
```typescript
const response = await ipcRenderer.invoke('message:send', {
  sessionId: 'session-123',
  content: '帮我分析这个项目的代码结构',
  agentCode: 'qianliyan'  // 使用千里眼 Agent
})
```

---

### message:list

获取会话的消息历史。

| 属性 | 值 |
|------|-----|
| 通道 | `message:list` |
| 方向 | Renderer → Main |

**参数**:
```typescript
sessionId: string
```

**返回**:
```typescript
Message[]  // 按创建时间正序排列
```

---

## 空间管理 API

管理工作空间 (对应本地目录)。

### space:create

创建新工作空间。

| 属性 | 值 |
|------|-----|
| 通道 | `space:create` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  name: string      // 空间名称
  workDir: string   // 本地目录路径
}
```

**返回**:
```typescript
{
  success: boolean
  data?: Space
  error?: string
}
```

---

### space:list

获取所有工作空间列表。

| 属性 | 值 |
|------|-----|
| 通道 | `space:list` |
| 方向 | Renderer → Main |

**参数**: 无

**返回**:
```typescript
{
  success: boolean
  data?: Space[]
  error?: string
}
```

---

### space:get

获取单个工作空间详情。

| 属性 | 值 |
|------|-----|
| 通道 | `space:get` |
| 方向 | Renderer → Main |

**参数**:
```typescript
spaceId: string
```

**返回**:
```typescript
{
  success: boolean
  data?: Space
  error?: string
}
```

---

### space:update

更新工作空间信息。

| 属性 | 值 |
|------|-----|
| 通道 | `space:update` |
| 方向 | Renderer → Main |

**参数**:
```typescript
spaceId: string
updates: {
  name?: string
  workDir?: string
}
```

**返回**:
```typescript
{
  success: boolean
  data?: Space
  error?: string
}
```

---

### space:delete

删除工作空间。

| 属性 | 值 |
|------|-----|
| 通道 | `space:delete` |
| 方向 | Renderer → Main |

**参数**:
```typescript
spaceId: string
```

**返回**:
```typescript
{
  success: boolean
  error?: string
}
```

---

### dialog:select-folder

打开文件夹选择对话框。

| 属性 | 值 |
|------|-----|
| 通道 | `dialog:select-folder` |
| 方向 | Renderer → Main |

**参数**: 无

**返回**:
```typescript
{
  success: boolean
  data?: string | null  // 选中的路径，取消返回 null
  error?: string
}
```

---

## 模型配置 API

管理 LLM 模型配置。

### model:create

创建新的模型配置。

| 属性 | 值 |
|------|-----|
| 通道 | `model:create` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  provider: string     // 提供商 (openai, anthropic, google)
  modelName: string    // 模型名称 (gpt-4o, claude-3-opus 等)
  apiKey?: string      // API Key (会被加密存储)
  apiKeyId?: string    // 关联的 API Key ID
  baseURL?: string     // 自定义 API 端点
  config?: object      // 额外配置 (温度等)
}
```

**返回**:
```typescript
Model  // API Key 会被掩码处理
```

---

### model:list

获取所有模型配置。

| 属性 | 值 |
|------|-----|
| 通道 | `model:list` |
| 方向 | Renderer → Main |

**参数**: 无

**返回**:
```typescript
Model[]  // API Key 会被掩码处理
```

---

### model:update

更新模型配置。

| 属性 | 值 |
|------|-----|
| 通道 | `model:update` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  id: string
  data: Partial<Model>
}
```

**返回**:
```typescript
Model
```

---

### model:delete

删除模型配置。

| 属性 | 值 |
|------|-----|
| 通道 | `model:delete` |
| 方向 | Renderer → Main |

**参数**:
```typescript
id: string
```

**返回**:
```typescript
Model  // 被删除的模型
```

---

## 任务管理 API

管理 AI 任务的创建和跟踪。

### task:create

创建新任务。

| 属性 | 值 |
|------|-----|
| 通道 | `task:create` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  sessionId: string
  parentTaskId?: string
  type: 'user' | 'delegated' | 'workforce'
  status: 'pending' | 'running' | 'completed' | 'failed'
  input: string
  output?: string
  assignedModel?: string
  assignedAgent?: string
  metadata?: Record<string, unknown>
}
```

**返回**:
```typescript
Task
```

---

### task:list

获取会话的任务列表。

| 属性 | 值 |
|------|-----|
| 通道 | `task:list` |
| 方向 | Renderer → Main |

**参数**:
```typescript
sessionId: string
```

**返回**:
```typescript
Task[]
```

---

### task:get

获取单个任务详情。

| 属性 | 值 |
|------|-----|
| 通道 | `task:get` |
| 方向 | Renderer → Main |

**参数**:
```typescript
taskId: string
```

**返回**:
```typescript
Task
```

---

### task:update

更新任务状态。

| 属性 | 值 |
|------|-----|
| 通道 | `task:update` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  id: string
  status?: string
  output?: string
}
```

**返回**:
```typescript
Task
```

---

## Agent 绑定 API

管理 Agent 和任务类别的模型绑定配置。

### agent-binding:list

获取所有 Agent 绑定配置。

| 属性 | 值 |
|------|-----|
| 通道 | `agent-binding:list` |
| 方向 | Renderer → Main |

**参数**: 无

**返回**:
```typescript
AgentBinding[]
```

---

### agent-binding:get

获取单个 Agent 的绑定配置。

| 属性 | 值 |
|------|-----|
| 通道 | `agent-binding:get` |
| 方向 | Renderer → Main |

**参数**:
```typescript
agentCode: string  // 如 'fuxi', 'baize' 等
```

**返回**:
```typescript
AgentBinding
```

---

### agent-binding:update

更新 Agent 绑定配置。

| 属性 | 值 |
|------|-----|
| 通道 | `agent-binding:update` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  agentCode: string
  data: {
    modelId?: string
    temperature?: number
    maxTokens?: number
  }
}
```

**返回**:
```typescript
AgentBinding
```

---

### agent-binding:reset

重置 Agent 绑定为默认值。

| 属性 | 值 |
|------|-----|
| 通道 | `agent-binding:reset` |
| 方向 | Renderer → Main |

**参数**:
```typescript
agentCode: string
```

**返回**:
```typescript
AgentBinding
```

---

### category-binding:list / get / update / reset

类别绑定 API，用法与 Agent 绑定 API 类似。

---

## 密钥管理 API

安全存储和管理 API 密钥。

### keychain:set-password

存储 API 密钥。

| 属性 | 值 |
|------|-----|
| 通道 | `keychain:set-password` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  id?: string         // 可选，更新现有密钥
  label?: string      // 标签
  baseURL: string     // API 端点
  apiKey: string      // API 密钥 (会被加密)
  provider?: string   // 提供商
}
```

**返回**:
```typescript
{ id: string }
```

---

### keychain:list-with-models

获取所有密钥及其关联的模型。

| 属性 | 值 |
|------|-----|
| 通道 | `keychain:list-with-models` |
| 方向 | Renderer → Main |

**参数**: 无

**返回**:
```typescript
Array<{
  id: string
  provider: string
  label: string | null
  baseURL: string
  apiKeyMasked: string  // 掩码处理后的密钥
  models: Array<{
    id: string
    modelName: string
    provider: string
  }>
}>
```

---

### keychain:get-with-models

获取单个密钥详情 (包含完整密钥)。

| 属性 | 值 |
|------|-----|
| 通道 | `keychain:get-with-models` |
| 方向 | Renderer → Main |

**参数**:
```typescript
apiKeyId: string
```

**返回**:
```typescript
{
  id: string
  provider: string
  label: string | null
  baseURL: string
  apiKey: string  // 完整的解密后密钥
  models: ApiKeyModelInfo[]
} | null
```

---

### keychain:delete-password

删除密钥。

| 属性 | 值 |
|------|-----|
| 通道 | `keychain:delete-password` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  service: string
  account: string
  id?: string
}
```

**返回**:
```typescript
boolean
```

---

## Artifact API

管理 AI 生成的文件产物。

### artifact:list

获取会话的 Artifact 列表。

| 属性 | 值 |
|------|-----|
| 通道 | `artifact:list` |
| 方向 | Renderer → Main |

**参数**:
```typescript
sessionId: string
// 或
{
  sessionId: string
  includeContent?: boolean  // 是否包含文件内容
}
```

**返回**:
```typescript
Artifact[]
```

---

### artifact:get

获取单个 Artifact 详情。

| 属性 | 值 |
|------|-----|
| 通道 | `artifact:get` |
| 方向 | Renderer → Main |

**参数**:
```typescript
artifactId: string
```

**返回**:
```typescript
Artifact
```

---

### artifact:get-diff

获取 Artifact 的差异对比。

| 属性 | 值 |
|------|-----|
| 通道 | `artifact:get-diff` |
| 方向 | Renderer → Main |

**参数**:
```typescript
artifactId: string
```

**返回**:
```typescript
string | null  // Unified diff 格式
```

---

### artifact:accept

接受 Artifact 的更改。

| 属性 | 值 |
|------|-----|
| 通道 | `artifact:accept` |
| 方向 | Renderer → Main |

**参数**:
```typescript
artifactId: string
```

**返回**:
```typescript
{ success: boolean; error?: string }
```

---

### artifact:revert

撤销 Artifact 的更改。

| 属性 | 值 |
|------|-----|
| 通道 | `artifact:revert` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  artifactId: string
  workDir: string
}
```

**返回**:
```typescript
{ success: boolean; error?: string }
```

---

### artifact:download

下载 Artifact 文件。

| 属性 | 值 |
|------|-----|
| 通道 | `artifact:download` |
| 方向 | Renderer → Main |

**参数**:
```typescript
artifactId: string
```

**返回**:
```typescript
{
  success: boolean
  data?: { filePath: string }
  error?: string
}
```

---

### artifact:stats

获取会话的 Artifact 统计信息。

| 属性 | 值 |
|------|-----|
| 通道 | `artifact:stats` |
| 方向 | Renderer → Main |

**参数**:
```typescript
sessionId: string
```

**返回**:
```typescript
{
  total: number
  created: number
  modified: number
  deleted: number
  accepted: number
  pending: number
}
```

---

## 浏览器控制 API

控制嵌入式浏览器进行网页自动化。

| 通道 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `browser:create` | `{ viewId, url }` | `{ success: boolean }` | 创建浏览器实例 |
| `browser:navigate` | `{ viewId, url }` | `{ success: boolean }` | 导航到 URL |
| `browser:go-back` | `{ viewId }` | `{ success: boolean }` | 后退 |
| `browser:go-forward` | `{ viewId }` | `{ success: boolean }` | 前进 |
| `browser:reload` | `{ viewId }` | `{ success: boolean }` | 刷新 |
| `browser:stop` | `{ viewId }` | `{ success: boolean }` | 停止加载 |
| `browser:capture` | `{ viewId }` | `{ success: true, data: string }` | 截图 (Base64) |
| `browser:execute-js` | `{ viewId, code }` | `{ success: true, data: any }` | 执行 JS |
| `browser:zoom` | `{ viewId, level }` | `{ success: boolean }` | 设置缩放 |

---

## 系统设置 API

管理应用系统设置。

### setting:get

获取设置项。

| 属性 | 值 |
|------|-----|
| 通道 | `setting:get` |
| 方向 | Renderer → Main |

**参数**:
```typescript
key: string
```

**返回**:
```typescript
any
```

---

### setting:set

设置配置项。

| 属性 | 值 |
|------|-----|
| 通道 | `setting:set` |
| 方向 | Renderer → Main |

**参数**:
```typescript
{
  key: string
  value: any
}
```

---

### setting:get-all

获取所有设置。

| 属性 | 值 |
|------|-----|
| 通道 | `setting:get-all` |
| 方向 | Renderer → Main |

**返回**:
```typescript
Record<string, any>
```

---

## 流式事件 API

Main 进程向 Renderer 推送的实时事件。

### message:stream-chunk

消息流式响应块。

| 属性 | 值 |
|------|-----|
| 通道 | `message:stream-chunk` |
| 方向 | Main → Renderer |

**数据格式**:
```typescript
{
  sessionId: string
  content: string        // 文本内容
  done: boolean          // 是否完成
  type: 'text' | 'tool_call' | 'error' | 'done'
  toolCall?: {           // 工具调用信息
    name: string
    arguments: object
    result?: string
  }
  error?: {              // 错误信息
    message: string
    code: string
  }
}
```

**示例**:
```typescript
ipcRenderer.on('message:stream-chunk', (event, data) => {
  if (data.type === 'text') {
    appendToMessage(data.content)
  } else if (data.type === 'tool_call') {
    showToolCall(data.toolCall)
  } else if (data.done) {
    finishMessage()
  }
})
```

---

### message:stream-error

消息流错误事件。

| 属性 | 值 |
|------|-----|
| 通道 | `message:stream-error` |
| 方向 | Main → Renderer |

**数据格式**:
```typescript
{
  sessionId: string
  message: string
  code: string
}
```

---

### message:stream-usage

Token 使用统计。

| 属性 | 值 |
|------|-----|
| 通道 | `message:stream-usage` |
| 方向 | Main → Renderer |

**数据格式**:
```typescript
{
  sessionId: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}
```

---

### task:status-changed

任务状态变更事件。

| 属性 | 值 |
|------|-----|
| 通道 | `task:status-changed` |
| 方向 | Main → Renderer |

**数据格式**:
```typescript
{
  taskId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
}
```

---

### artifact:created

Artifact 创建事件。

| 属性 | 值 |
|------|-----|
| 通道 | `artifact:created` |
| 方向 | Main → Renderer |

**数据格式**:
```typescript
{
  id: string
  sessionId: string
  path: string
  type: 'file'
  changeType: 'created' | 'modified' | 'deleted'
}
```

---

### browser:state-changed

浏览器状态变更事件。

| 属性 | 值 |
|------|-----|
| 通道 | `browser:state-changed` |
| 方向 | Main → Renderer |

**数据格式**:
```typescript
{
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}
```

---

## 会话恢复 API

支持会话的保存和恢复。

| 通道 | 参数 | 说明 |
|------|------|------|
| `session-state:get` | `sessionId` | 获取会话状态快照 |
| `session-state:checkpoint` | `sessionId` | 创建检查点 |
| `session-recovery:plan` | `sessionId` | 生成恢复计划 |
| `session-recovery:execute` | 恢复计划 | 执行恢复 |
| `session-recovery:list` | 无 | 列出可恢复会话 |
| `session-recovery:resume-prompt` | `sessionId` | 获取恢复提示 |

### 恢复场景矩阵（Task Continuation + Session Recovery）

> 目的：定义自动续跑与崩溃恢复的核心场景，作为后续 P1-2-B 测试补齐基线。

| 场景ID | 触发条件 | 前置状态 | 预期行为 | 观测点（代码证据） | 当前测试覆盖 |
|---|---|---|---|---|---|
| R1 未完成 Todo 自动续跑判定 | 请求续跑状态 | 存在未完成 todo，且不在 abort 抑制窗口 | `shouldContinue = true`，返回 continuation prompt | `src/main/services/task-continuation.service.ts:98-125` | 已覆盖（unit）`tests/unit/services/task-continuation.test.ts:89-119` |
| R2 用户主动中止后的抑制 | 用户执行 abort 后立即请求续跑状态 | `markAborted` 已记录，未超过 `abortWindowMs` | `shouldContinue = false`，不触发续跑 | `src/main/services/task-continuation.service.ts:142-160`；`src/main/ipc/handlers/message.ts:454` | 已覆盖（unit）`tests/unit/services/task-continuation.test.ts:144-171` |
| R3 抑制窗口过期后恢复资格 | abort 后等待超过窗口再次请求续跑状态 | `markAborted` 已记录，已超过 `abortWindowMs` | 重新允许续跑判定（可返回 true） | `src/main/services/task-continuation.service.ts:142-160` | 已覆盖（unit）`tests/unit/services/task-continuation.test.ts:161-171` |
| R4 Boulder 会话白名单隔离 | 在非授权 session 请求续跑状态 | boulder `session_ids` 不包含当前 session | `shouldContinue = false`，提示中不注入该会话续跑路径 | `src/main/services/task-continuation.service.ts:234-241` | 已覆盖（unit）`tests/unit/services/task-continuation.test.ts:275-316` |
| R5 active plan 提示优先 | 生成续跑提示 | boulder 存在 `active_plan` | prompt 使用 active plan 路径替代默认提示 | `src/main/services/task-continuation.service.ts:243-267` | 已覆盖（unit）`tests/unit/services/task-continuation.test.ts:111-119` |
| R6 自动续跑倒计时去重 | 连续触发续跑倒计时 | 两次触发间隔小于 `idleDedupWindowMs` | 第二次触发被去重，避免重复自动续跑 | `src/main/services/task-continuation.service.ts:162-205` | 已覆盖（unit）`tests/unit/services/task-continuation.test.ts:224-238` |
| R7 跨重启崩溃检测与候选恢复 | 应用启动时检测 crash marker | 会话存在未完成工作 + marker 命中 | 将会话标记为 crashed，可进入恢复计划流程 | `src/main/services/session-continuity.service.ts:486-576`；`src/main/index.ts:113-123` | 部分覆盖（workflow/integration）`tests/unit/services/workforce/workforce-engine.test.ts:2076-2149`；`tests/integration/workforce-engine.test.ts:591-717` |
| R8 恢复计划执行分支 | 执行恢复计划 | 恢复模式开/关，且存在可恢复/不可恢复任务 | 返回 success / unrecoverable / disabled 分支结果 | `src/main/services/session-continuity.service.ts:581-633` | 部分覆盖（workflow/unit）`tests/unit/services/workforce/workforce-engine.test.ts:2195-2234` |
| R9 UI 手动恢复链路 | 用户点击“继续任务” | UI 已拿到 `continuationPrompt` | Renderer 调用 `message:send`，把 continuationPrompt 作为用户消息发送 | `src/renderer/src/components/session/SessionResumeIndicator.tsx:120-130` | 已覆盖（E2E）`tests/e2e/session-workflow.spec.ts:161-307`；已覆盖（renderer unit）`tests/unit/renderer/session-resume-indicator.test.tsx:8-46` |

#### 覆盖结论

- 核心判定逻辑（R1-R6）已有单测覆盖，可作为稳定基线。
- 跨重启与恢复执行（R7-R8）已有工作流级覆盖，但缺少面向 `SessionContinuityService` 行为边界的专门测试。
- UI 手动恢复链路（R9）已由 renderer unit + E2E 覆盖，从 IPC 状态到消息发送链路具备自动化验证。

---

## 数据库 Schema

GodCode 使用 Prisma + PostgreSQL。

### Space

```prisma
model Space {
  id        String    @id @default(uuid())
  name      String
  workDir   String
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  sessions  Session[]
}
```

### Session

```prisma
model Session {
  id        String     @id @default(uuid())
  spaceId   String
  title     String
  status    String     @default("active")
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  space     Space      @relation(...)
  messages  Message[]
  tasks     Task[]
  artifacts Artifact[]
}
```

### Message

```prisma
model Message {
  id        String   @id @default(uuid())
  sessionId String
  role      String   // "user" | "assistant" | "system"
  content   String   @db.Text
  metadata  Json?
  createdAt DateTime @default(now())
  session   Session  @relation(...)
}
```

### Task

```prisma
model Task {
  id            String    @id @default(uuid())
  sessionId     String
  parentTaskId  String?
  type          String    // "user" | "delegated" | "workforce"
  status        String    // "pending" | "running" | "completed" | "failed"
  input         String    @db.Text
  output        String?   @db.Text
  assignedModel String?
  assignedAgent String?
  metadata      Json?
  createdAt     DateTime  @default(now())
  startedAt     DateTime?
  completedAt   DateTime?
}
```

### Artifact

```prisma
model Artifact {
  id         String   @id @default(uuid())
  sessionId  String
  taskId     String?
  type       String   // "file"
  path       String
  content    String?  @db.Text
  size       Int?
  changeType String   // "created" | "modified" | "deleted"
  accepted   Boolean  @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

### Model

```prisma
model Model {
  id        String   @id @default(uuid())
  provider  String
  modelName String
  apiKey    String?
  apiKeyId  String?
  baseURL   String?
  config    Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### ApiKey

```prisma
model ApiKey {
  id           String   @id @default(uuid())
  provider     String
  label        String?
  baseURL      String
  encryptedKey String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  models       Model[]
}
```

---

## 使用示例

### 发送消息并处理流式响应

```typescript
async function sendMessage(sessionId: string, content: string) {
  // 设置流式响应监听
  const handleChunk = (_, data) => {
    if (data.sessionId !== sessionId) return

    if (data.type === 'text') {
      // 追加文本
      updateMessageContent(data.content)
    } else if (data.type === 'tool_call') {
      // 显示工具调用
      showToolExecution(data.toolCall)
    } else if (data.done) {
      // 完成
      finishMessage()
    }
  }

  ipcRenderer.on('message:stream-chunk', handleChunk)

  try {
    const response = await ipcRenderer.invoke('message:send', {
      sessionId,
      content
    })
    return response
  } finally {
    ipcRenderer.removeListener('message:stream-chunk', handleChunk)
  }
}
```

### 创建工作空间

```typescript
async function createWorkspace() {
  // 1. 选择文件夹
  const { success, data: path } = await ipcRenderer.invoke('dialog:select-folder')

  if (!success || !path) {
    return null
  }

  // 2. 创建空间
  const result = await ipcRenderer.invoke('space:create', {
    name: path.split('/').pop(),
    workDir: path
  })

  if (result.success) {
    // 3. 创建默认会话
    const session = await ipcRenderer.invoke('session:create', {
      spaceId: result.data.id,
      title: 'New Chat'
    })

    return { space: result.data, session }
  }

  return null
}
```
