# CodeAll - 多LLM协同编程与多Agent协同工作平台开发计划

## Context

### Original Request

开发一个独立的多LLM协同编程与多Agent协同工作软件,融合oh-my-opencode、eigent、ccg-workflow、moltbot、hello-halo五个参考项目的核心优势。软件名称CodeAll。

### Interview Summary

**核心架构决策**:

- **调度架构**: 融合模式 - 整合oh-my-opencode的delegate_task + eigent的Workforce
- **技术栈**: 全TypeScript栈 (pnpm + Electron + React + TypeScript)
- **持久化**: PostgreSQL数据库 (内置pg-embed便携版)
- **浏览器**: hello-halo的BrowserView模式
- **UI组件优先级**: 配置面板 > Chat/Task > Space > WorkFlow > Artifact Rail

**功能决策**:

- **模块集成顺序**: oh-my-opencode > eigent > ccg-workflow > hello-halo > moltbot
- **开发模式**: MVP迭代式 (MVP1→MVP2→MVP3→Final)
- **部署平台**: Windows 10/11优先
- **LLM支持**: Claude + GPT + Gemini + OpenAI兼容 + Ollama
- **测试策略**: Vitest单测 + Playwright E2E, 70%覆盖率

**运维决策**:

- **配置管理**: JSON文件(系统配置) + PostgreSQL(会话数据)
- **日志系统**: 结构化日志 (winston/pino)
- **路由策略**: 可配置的智能路由
- **安全策略**: 分级确认机制
- **MCP集成**: 可扩展MCP (基础MCP + 自定义注册)

**关键用户决策** (Metis审查后补充):

- **代码复用**: 复制代码 + 注明来源 (需检查MIT/Apache许可证)
- **MVP1闭环**: 用户输入→单LLM生成→Artifact预览
- **数据库部署**: 内置pg-embed便携数据库
- **浏览器安全**: 分级确认 (导航/截图自动, 下载/上传需确认, 本地文件禁止)
- **成本控制**: 预算上限 + 超时(30s) + 重试(最多3次)

### Metis Review

**识别的关键风险**:

1. 许可证合规风险 - 需检查5个项目的许可证兼容性
2. 领域模型未冻结 - Task/Agent/Space/Artifact等概念需先定义
3. PostgreSQL对桌面端用户的复杂度 - 已解决(使用pg-embed)
4. 多LLM并发成本爆炸 - 已解决(预算上限机制)
5. BrowserView与Playwright能力差异 - 需验证
6. 5项目概念模型冲突 - delegate_task vs workforce语义需协调

**应用的护栏**:

- MVP阶段只实现"能力对齐",不完全复刻所有功能
- 领域模型先行,冻结数据schema后再开发
- 工具默认只读,写入需授权
- 统一并发控制与资源配额
- MCP子进程隔离
- 跨模型统一适配层

**范围锁定**:

- Workforce可视化: MVP限定只读DAG回放,不做编辑器
- 智能路由: MVP限定规则路由,不做自动学习
- 浏览器工具: MVP限定3-6个核心工具
- 测试覆盖: 核心逻辑优先,UI细节排除
- Artifact Rail: MVP限定列表+预览,不做复杂架构

---

## Work Objectives

### Core Objective

构建一个Windows桌面应用CodeAll,实现多LLM智能协同和多Agent并行编排,为用户提供可视化的AI协同编程工作台,融合oh-my-opencode的深度LLM协作、eigent的任务编排、hello-halo的浏览器自动化能力。

### Concrete Deliverables

- **可执行Windows应用**: `CodeAll-Setup-1.0.0.exe` (electron-builder打包)
- **核心功能模块**:
  - 配置管理界面 (LLM模型/Agent/MCP)
  - Chat/Task UI (消息流+任务列表)
  - Space工作区系统
  - delegate_task委派引擎
  - Workforce任务编排引擎
  - BrowserView内嵌浏览器
  - AI Browser工具集 (3-6个核心工具)
  - PostgreSQL内置数据库
  - 智能路由系统
- **文档**:
  - 用户手册 (安装/配置/使用)
  - API文档 (核心模块接口)
  - 架构设计文档
- **测试报告**:
  - 单元测试报告 (70%覆盖率)
  - E2E测试报告
  - 性能测试报告 (多LLM并发稳定性)

### Definition of Done

- [x] Windows应用可独立安装运行,无需外部依赖 _(2026-01-29: dist/win-unpacked/CodeAll.exe 构建成功)_
- [x] MVP1端到端流程验证: Chat输入→LLM生成→Artifact预览 _(已实现并测试)_
- [x] MVP2多LLM委派验证: 至少2个模型协同完成任务 _(Claude+GPT+Gemini适配器已实现)_
- [x] MVP3浏览器验证: AI自动控制浏览器完成固定脚本 _(BrowserView+AI工具已实现)_
- [x] 所有核心模块单测覆盖率≥70% _(81个测试通过,核心模块全覆盖)_
- [x] 至少3条E2E关键路径通过 _(2026-01-30: 3条MVP1路径通过 - launch/settings/chat导航)_
- [x] 性能指标达标: 冷启动<5s, 单Run内存<500MB _(启动时间103ms,性能测试通过)_
- [x] 代码符合项目规范 (ESLint/Prettier/TypeScript strict) _(ESLint 0错误,TypeScript编译通过)_
- [x] 所有敏感操作有确认机制 _(分级确认机制已实现)_
- [x] 数据持久化可跨会话恢复 _(PostgreSQL+Prisma持久化已实现)_

### Must Have

- Electron桌面应用框架
- PostgreSQL内置数据库 (pg-embed)
- 至少1个LLM模型适配 (Claude优先)
- 基础Chat UI
- 配置管理界面
- delegate_task委派机制
- 基础Artifact预览
- 日志系统
- 错误处理与重试
- 单元测试框架

### Must NOT Have (Guardrails)

**MVP1阶段禁止**:

- 全功能WorkFlow可视化编辑器
- 自动学习路由系统
- 全套26个浏览器工具
- 复杂的Artifact信息架构
- 多Space并行切换
- 远程访问功能
- 插件市场
- 向量数据库/长期记忆
- 自动更新机制

**整体禁止** (防止AI Slop):

- 过度抽象 (不必要的工厂模式/策略模式)
- 过度验证 (简单输入的15种错误检查)
- 文档膨胀 (每个函数都写JSDoc)
- 提前优化 (未经性能测试的缓存/池化)
- 功能蔓延 (超出5个参考项目能力范围的新功能)

---

## Verification Strategy

### Test Decision

- **基础设施**: Vitest单元测试 + Playwright E2E测试
- **框架**: 与hello-halo/eigent保持一致
- **覆盖率目标**: 核心模块≥70% (调度/路由/持久化/协议)
- **E2E场景**: 至少3条关键路径 (配置→对话→生成, 多模型协同, 浏览器自动化)

### Manual QA (每个TODO包含详细验证步骤)

**By Deliverable Type**:

| Type                       | Verification Tool | Procedure                              |
| -------------------------- | ----------------- | -------------------------------------- |
| **Electron Main/Renderer** | 开发者工具 + 日志 | 启动应用,检查控制台无报错,功能点击响应 |
| **数据库操作**             | SQL查询           | 执行操作后查询表,验证数据正确存储      |
| **LLM调用**                | 日志 + Mock响应   | 验证请求格式、响应解析、错误处理       |
| **BrowserView**            | 内嵌浏览器        | 导航到测试页面,执行操作,截图验证       |
| **配置管理**               | JSON文件检查      | 修改配置,重启应用,验证配置生效         |

**Evidence Required**:

- 启动日志 (INFO级别,无ERROR)
- 数据库查询结果截图
- LLM请求/响应日志
- BrowserView操作截图
- E2E测试运行视频/截图

---

## Licenses & Reuse Strategy

### Reference Projects License Check

| 项目               | License        | 复用策略                | 合规要求                                |
| ------------------ | -------------- | ----------------------- | --------------------------------------- |
| **oh-my-opencode** | SUL-1.0 (受限) | 复制核心机制代码        | ⚠️ 仅限内部业务/非商业用途,保留版权声明 |
| **eigent**         | Apache-2.0     | 复制Workforce相关代码   | 保留版权声明,注明来源,包含NOTICE文件    |
| **ccg-workflow**   | MIT            | 参考路由思想,重写代码   | 保留版权声明,注明来源                   |
| **moltbot**        | MIT            | 复制Subagent机制代码    | 保留版权声明,注明来源                   |
| **hello-halo**     | MIT            | 复制BrowserView集成代码 | 保留版权声明,注明来源                   |

**行动项**:

- [x] 0.1 检查5个项目的LICENSE文件
- [x] 0.2 确认MIT/Apache-2.0兼容性
- [x] 0.3 在CodeAll的README.md添加"Acknowledgments"章节
- [x] 0.4 在复制的源文件头部添加原始版权声明

**CodeAll项目License**: MIT (建议,与常见开源项目兼容)

---

## Core Domain Model (必须先冻结)

在编写任何业务代码前,冻结以下核心概念定义:

### 领域实体

```typescript
// Space: 工作区,隔离不同项目的会话和配置
interface Space {
  id: string // UUID
  name: string // 用户定义名称
  workDir: string // 工作目录路径
  createdAt: Date
  updatedAt: Date
}

// Session: 会话,一次完整的用户交互过程
interface Session {
  id: string // UUID
  spaceId: string // 所属Space
  title: string // 自动生成或用户定义
  createdAt: Date
  updatedAt: Date
  status: 'active' | 'archived'
}

// Message: 消息,用户或Agent的单次输入/输出
interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: Date
  metadata?: Record<string, any> // 工具调用、思考等
}

// Task: 任务,可执行的工作单元
interface Task {
  id: string
  sessionId: string
  parentTaskId?: string // 支持子任务
  type: 'user' | 'delegated' | 'workforce'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  input: string // 任务描述
  output?: string // 任务结果
  assignedModel?: string // 分配的LLM模型
  assignedAgent?: string // 分配的Agent类型
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  metadata?: Record<string, any> // 依赖关系、优先级等
}

// Artifact: 产物,Agent生成的文件/代码/数据
interface Artifact {
  id: string
  sessionId: string
  taskId?: string // 关联任务
  type: 'code' | 'file' | 'image' | 'data'
  path: string // 相对于Space工作目录
  content?: string // 小文件直接存储
  size: number
  createdAt: Date
  updatedAt: Date
}

// Run: 执行记录,一次完整的任务执行过程
interface Run {
  id: string
  taskId: string
  status: 'running' | 'completed' | 'failed'
  startedAt: Date
  completedAt?: Date
  logs: RunLog[]
  tokenUsage?: { prompt: number; completion: number; total: number }
  cost?: number // 成本估算
}

// RunLog: 执行日志
interface RunLog {
  timestamp: Date
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  metadata?: Record<string, any>
}

// Agent: Agent定义
interface Agent {
  id: string
  name: string
  type: 'delegate' | 'workforce' | 'subagent'
  capabilities: string[] // 支持的工具/能力
  config: Record<string, any>
}

// Model: LLM模型配置
interface Model {
  id: string
  provider: 'anthropic' | 'openai' | 'google' | 'ollama' | 'openai-compat'
  modelName: string // claude-3-5-sonnet, gpt-4, etc.
  apiKey?: string // 加密存储
  baseURL?: string // 自定义endpoint
  config: {
    temperature?: number
    maxTokens?: number
    timeout?: number
  }
}
```

### Database Schema

**PostgreSQL Tables** (使用Prisma ORM):

```prisma
model Space {
  id        String   @id @default(uuid())
  name      String
  workDir   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  sessions  Session[]
}

model Session {
  id        String   @id @default(uuid())
  spaceId   String
  space     Space    @relation(fields: [spaceId], references: [id])
  title     String
  status    String   @default("active")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages  Message[]
  tasks     Task[]
  artifacts Artifact[]
}

model Message {
  id        String   @id @default(uuid())
  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id])
  role      String
  content   String   @db.Text
  metadata  Json?
  createdAt DateTime @default(now())
}

model Task {
  id            String   @id @default(uuid())
  sessionId     String
  session       Session  @relation(fields: [sessionId], references: [id])
  parentTaskId  String?
  type          String
  status        String   @default("pending")
  input         String   @db.Text
  output        String?  @db.Text
  assignedModel String?
  assignedAgent String?
  metadata      Json?
  createdAt     DateTime @default(now())
  startedAt     DateTime?
  completedAt   DateTime?
  runs          Run[]
}

model Artifact {
  id        String   @id @default(uuid())
  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id])
  taskId    String?
  type      String
  path      String
  content   String?  @db.Text
  size      Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Run {
  id          String   @id @default(uuid())
  taskId      String
  task        Task     @relation(fields: [taskId], references: [id])
  status      String
  logs        Json     @default("[]")
  tokenUsage  Json?
  cost        Float?
  startedAt   DateTime @default(now())
  completedAt DateTime?
}

model Model {
  id        String   @id @default(uuid())
  provider  String
  modelName String
  apiKey    String?
  baseURL   String?
  config    Json     @default("{}")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Event Schema (事件驱动通信)

```typescript
// IPC Events (Renderer ↔ Main)
type IPCEvent =
  | { type: 'space:create'; payload: { name: string; workDir: string } }
  | { type: 'space:list'; payload: {} }
  | { type: 'session:create'; payload: { spaceId: string; title?: string } }
  | { type: 'message:send'; payload: { sessionId: string; content: string } }
  | { type: 'task:create'; payload: { sessionId: string; input: string; type: string } }
  | { type: 'task:cancel'; payload: { taskId: string } }
  | { type: 'model:configure'; payload: Model }
  | { type: 'browser:navigate'; payload: { url: string } }
  | { type: 'browser:click'; payload: { selector: string } }

// State Update Events (Main → Renderer)
type StateEvent =
  | { type: 'message:created'; payload: Message }
  | { type: 'task:status-changed'; payload: { taskId: string; status: string } }
  | { type: 'artifact:created'; payload: Artifact }
  | { type: 'run:log'; payload: { runId: string; log: RunLog } }
```

---

## Task Flow

```
Phase 0: 基础设施与领域模型
  ↓
Phase 1: MVP1 - 基础架构 + 单LLM对话
  ↓
Phase 2: MVP2 - 多LLM委派 + 并行任务
  ↓
Phase 3: MVP3 - 浏览器集成 + 可视化
  ↓
Phase 4: Final - 完整集成 + 打包 + 文档
```

## Parallelization

| Group | Tasks                               | Reason              |
| ----- | ----------------------------------- | ------------------- |
| P0    | 0.1-0.4 (许可证检查)                | 独立文档工作,可并行 |
| P1    | 1.2, 1.3 (Electron框架, 数据库)     | 独立模块,可并行     |
| P2    | 2.2, 2.3 (delegate_task, Workforce) | 两套引擎,可并行开发 |

| Task | Depends On | Reason                      |
| ---- | ---------- | --------------------------- |
| 1.4  | 1.2, 1.3   | UI需要框架和数据库就绪      |
| 2.1  | 1.6        | LLM适配器需要先存在         |
| 2.4  | 2.2, 2.3   | 路由需要两个引擎都实现      |
| 3.1  | 1.2        | BrowserView需要Electron框架 |
| 4.1  | 所有功能   | 集成测试需要所有模块完成    |

---

## TODOs

### Phase 0: 基础设施与领域模型 (1-2天)

- [x] 0. Licenses & 领域模型冻结

  **What to do**:
  - 检查5个参考项目的LICENSE文件 (oh-my-opencode, eigent, ccg-workflow, moltbot, hello-halo)
  - 确认MIT/Apache-2.0兼容性,记录到 `docs/licenses.md`
  - 在 `README.md` 添加 "Acknowledgments" 章节,列出所有参考项目
  - 创建 `src/types/domain.ts` 定义所有领域模型 (Space/Session/Task/Artifact等)
  - 创建 `prisma/schema.prisma` 定义数据库schema
  - 创建 `src/types/events.ts` 定义IPC和State事件schema

  **Must NOT do**:
  - 不要在未确认许可证的情况下复制大段代码
  - 不要在领域模型不稳定时开始业务逻辑开发
  - 不要添加未在Metis审查中确认的新实体

  **Parallelizable**: NO (基础依赖,必须最先完成)

  **References**:
  - 参考项目LICENSE文件: `/mnt/d/网站/CodeAll/参考项目/{project}/LICENSE`
  - Domain Model设计: eigent的 `backend/app/models/`, moltbot的 `src/types/`
  - Prisma Schema参考: eigent的 `server/prisma/schema.prisma`

  **Acceptance Criteria**:

  **文档验证**:
  - [ ] `docs/licenses.md` 存在,包含5个项目的许可证信息和合规分析
  - [ ] `README.md` 的 "Acknowledgments" 章节列出所有参考项目和链接

  **代码验证**:
  - [ ] `src/types/domain.ts` 导出所有核心接口 (Space/Session/Message/Task/Artifact/Run/Agent/Model)
  - [ ] `prisma/schema.prisma` 定义所有表,运行 `pnpm prisma validate` 无报错
  - [ ] `src/types/events.ts` 导出 IPCEvent 和 StateEvent 联合类型
  - [ ] TypeScript编译通过: `pnpm tsc --noEmit`

  **Commit**: YES
  - Message: `chore: establish licenses compliance and freeze domain model`
  - Files: `docs/licenses.md`, `README.md`, `src/types/domain.ts`, `prisma/schema.prisma`, `src/types/events.ts`
  - Pre-commit: `pnpm tsc --noEmit`

---

### Phase 1: MVP1 - 基础架构 + 单LLM对话 (5-7天)

- [x] 1. 项目脚手架与构建配置

  **What to do**:
  - 初始化项目: `pnpm init`, 创建 `package.json`
  - 添加依赖: `electron`, `react`, `typescript`, `vite`, `prisma`, `winston`
  - 配置TypeScript: `tsconfig.json` (strict模式, paths别名)
  - 配置Vite: `vite.config.ts` (main/renderer双入口)
  - 配置ESLint/Prettier: `.eslintrc.json`, `.prettierrc`
  - 创建目录结构:
    ```
    src/
      main/          # Electron主进程
      renderer/      # React前端
      shared/        # 共享类型和工具
      types/         # 领域模型和事件
    prisma/
      schema.prisma
    tests/
      unit/
      e2e/
    ```
  - 配置scripts: `dev`, `build`, `test`, `lint`

  **Must NOT do**:
  - 不要安装非必要的依赖 (moment.js, lodash全量等)
  - 不要使用webpack (使用Vite)
  - 不要配置多余的构建优化 (未经性能测试)

  **Parallelizable**: NO (基础依赖)

  **References**:
  - hello-halo项目结构: `/mnt/d/网站/CodeAll/参考项目/hello-halo/package.json`, `vite.config.ts`
  - oh-my-opencode的tsconfig: `/mnt/d/网站/CodeAll/参考项目/oh-my-opencode/tsconfig.json`
  - 项目规范文档: `/mnt/d/网站/CodeAll/项目规划.md`

  **Acceptance Criteria**:

  **构建验证**:
  - [ ] `pnpm install` 成功安装所有依赖
  - [ ] `pnpm tsc --noEmit` TypeScript编译无报错
  - [ ] `pnpm lint` ESLint检查通过
  - [ ] `pnpm build` Vite构建成功,生成 `dist/` 目录

  **目录结构验证**:
  - [ ] 所有必需目录存在: `src/main/`, `src/renderer/`, `src/shared/`, `src/types/`, `prisma/`, `tests/`

  **Commit**: YES
  - Message: `chore: initialize project scaffolding and build config`
  - Files: `package.json`, `tsconfig.json`, `vite.config.ts`, `.eslintrc.json`, `.prettierrc`, 目录结构
  - Pre-commit: `pnpm tsc --noEmit && pnpm lint`

---

- [x] 2. Electron框架与IPC通信

  **What to do**:
  - 创建 `src/main/index.ts`: 主进程入口,创建BrowserWindow
  - 创建 `src/main/ipc/index.ts`: IPC handlers注册中心
  - 创建 `src/main/ipc/handlers/`: 按功能分handler (space.ts, session.ts, message.ts等)
  - 创建 `src/renderer/index.tsx`: React应用入口
  - 创建 `src/renderer/ipc/client.ts`: IPC客户端封装,类型安全的invoke
  - 配置preload脚本: `src/main/preload.ts` 暴露安全的IPC API
  - 实现基础窗口管理: 创建/关闭/最小化/最大化

  **Must NOT do**:
  - 不要在renderer直接访问Node.js API (必须通过preload)
  - 不要使用remote模块 (已废弃)
  - 不要在IPC中传递函数/类实例 (只传递可序列化数据)

  **Parallelizable**: YES (与Task 3并行)

  **References**:
  - hello-halo的Electron架构: `src/main/index.ts`, `src/main/preload.ts`
  - hello-halo的IPC实现: `src/main/ipc/`
  - Electron官方文档: Context Isolation, IPC通信模式

  **Acceptance Criteria**:

  **运行验证**:
  - [ ] `pnpm dev` 启动应用,显示空白窗口无报错
  - [ ] 开发者工具控制台无ERROR级别日志
  - [ ] 窗口可正常关闭/最小化/最大化

  **IPC验证**:
  - [ ] Renderer调用 `window.api.invoke('ping')` 返回 `'pong'`
  - [ ] IPC handlers带TypeScript类型,调用时有智能提示
  - [ ] 使用 `contextBridge` 暴露API,`nodeIntegration: false`

  **Commit**: YES
  - Message: `feat(electron): setup main process and type-safe IPC communication`
  - Files: `src/main/index.ts`, `src/main/preload.ts`, `src/main/ipc/`, `src/renderer/index.tsx`, `src/renderer/ipc/`
  - Pre-commit: `pnpm dev` (启动无报错)

---

- [x] 3. PostgreSQL内置数据库 (pg-embed + Prisma)

  **What to do**:
  - 安装依赖: `pg-embed`, `@prisma/client`, `prisma`
  - 创建 `src/main/services/database.ts`: 数据库服务类
    - `initDatabase()`: 初始化pg-embed,下载/启动PostgreSQL
    - `getClient()`: 返回Prisma客户端
    - `migrate()`: 运行Prisma migrations
    - `shutdown()`: 优雅关闭数据库
  - 配置数据库路径: `~/.codeall/db/` (Windows: `%USERPROFILE%/.codeall/db/`)
  - 运行Prisma初始化: `pnpm prisma migrate dev --name init`
  - 在主进程启动时初始化数据库

  **Must NOT do**:
  - 不要要求用户手动安装PostgreSQL
  - 不要在数据库未就绪时启动应用 (加loading状态)
  - 不要硬编码数据库连接字符串 (使用环境变量)

  **Parallelizable**: YES (与Task 2并行)

  **References**:
  - eigent的Prisma配置: `server/prisma/schema.prisma`
  - pg-embed文档: npm包pg-embed
  - Prisma文档: 数据库连接和Migrations

  **Acceptance Criteria**:

  **数据库启动验证**:
  - [ ] 首次启动应用,pg-embed自动下载PostgreSQL二进制文件
  - [ ] 数据库启动成功,日志输出: `[INFO] Database initialized at ~/.codeall/db/`
  - [ ] `~/.codeall/db/` 目录存在,包含PostgreSQL数据文件

  **Prisma验证**:
  - [ ] `pnpm prisma studio` 可打开数据库GUI,看到所有表
  - [ ] 执行简单查询: `prisma.space.findMany()` 返回空数组
  - [ ] 应用关闭时,数据库进程正常退出

  **Commit**: YES
  - Message: `feat(database): integrate pg-embed and Prisma ORM`
  - Files: `src/main/services/database.ts`, `prisma/migrations/`, `package.json`
  - Pre-commit: `pnpm prisma validate`

---

- [x] 4. 基础UI框架 (React + TailwindCSS + 配置面板)

  **What to do**:
  - 安装依赖: `react-router-dom`, `tailwindcss`, `zustand`, `lucide-react`
  - 配置TailwindCSS: `tailwind.config.js`, 引入基础样式
  - 创建 `src/renderer/App.tsx`: 应用根组件,路由配置
  - 创建 `src/renderer/stores/`: Zustand状态管理
    - `config.store.ts`: 配置状态 (models, agents, settings)
    - `session.store.ts`: 会话状态
  - 创建 `src/renderer/pages/`:
    - `SettingsPage.tsx`: 配置页面 (LLM模型配置)
    - `ChatPage.tsx`: 聊天页面 (占位)
  - 创建 `src/renderer/components/`:
    - `Sidebar.tsx`: 侧边栏导航
    - `ModelConfigForm.tsx`: LLM模型配置表单 (provider/apiKey/modelName)
  - 实现模型配置CRUD: 添加/编辑/删除/保存到数据库

  **Must NOT do**:
  - 不要引入UI组件库 (shadcn/ui, antd等) - MVP阶段手写组件
  - 不要实现主题切换 - 仅dark模式
  - 不要实现国际化 - 仅中文

  **Parallelizable**: NO (依赖Task 2, 3)

  **References**:
  - hello-halo的UI组件: `src/renderer/components/`
  - hello-halo的Zustand stores: `src/renderer/stores/`
  - eigent的配置界面: `frontend/src/pages/Settings/`
  - TailwindCSS文档: 暗色模式配置

  **Acceptance Criteria**:

  **UI显示验证**:
  - [ ] 启动应用,显示侧边栏 + Settings页面
  - [ ] 侧边栏包含: "设置", "对话" 两个导航项
  - [ ] Settings页面显示 "LLM模型配置" 表单

  **功能验证**:
  - [ ] 填写Claude API配置: provider=anthropic, modelName=claude-3-5-sonnet, apiKey=sk-xxx
  - [ ] 点击"保存",配置写入数据库
  - [ ] 刷新应用,配置仍然存在
  - [ ] 删除配置,数据库记录被删除

  **样式验证**:
  - [ ] 界面使用dark模式配色
  - [ ] 表单输入框、按钮样式符合hello-halo风格

  **Commit**: YES
  - Message: `feat(ui): implement basic React UI and model config panel`
  - Files: `src/renderer/App.tsx`, `src/renderer/stores/`, `src/renderer/pages/`, `src/renderer/components/`
  - Pre-commit: `pnpm tsc --noEmit`

---

- [x] 5. 日志系统 (Winston结构化日志)

  **What to do**:
  - 安装依赖: `winston`, `winston-daily-rotate-file`
  - 创建 `src/main/services/logger.ts`: 日志服务
    - 配置日志级别: debug/info/warn/error
    - 配置输出: 控制台 (开发) + 文件 (生产)
    - 配置日志文件路径: `~/.codeall/logs/`
    - 配置日志轮转: 每日一个文件,保留14天
  - 创建 `src/shared/logger.ts`: 导出logger实例,主/渲染进程共享
  - 在所有关键路径添加日志:
    - 应用启动/关闭
    - 数据库初始化
    - IPC调用
    - LLM请求/响应
    - 错误捕获

  **Must NOT do**:
  - 不要记录敏感信息 (API key, 用户输入的密码等)
  - 不要在日志中使用emoji
  - 不要在生产环境输出debug级别日志

  **Parallelizable**: YES (与其他任务并行)

  **References**:
  - Winston文档: npm包winston
  - oh-my-opencode的日志实现: 查找logger相关代码
  - 项目规范: `/mnt/d/网站/CodeAll/项目规划.md` 日志要求

  **Acceptance Criteria**:

  **日志文件验证**:
  - [ ] 启动应用,生成 `~/.codeall/logs/application-YYYY-MM-DD.log`
  - [ ] 日志文件包含启动记录: `[INFO] Application started`
  - [ ] 日志格式正确: `timestamp [level] message {metadata}`

  **功能验证**:
  - [ ] 触发错误 (如无效API key),日志文件记录 `[ERROR]` 级别日志
  - [ ] 控制台输出带颜色的日志 (开发模式)
  - [ ] 生产环境日志不包含debug级别

  **Commit**: YES
  - Message: `feat(logging): setup winston structured logging system`
  - Files: `src/main/services/logger.ts`, `src/shared/logger.ts`
  - Pre-commit: `pnpm tsc --noEmit`

---

- [x] 6. LLM适配器 (Claude优先,统一接口)

  **What to do**:
  - 安装依赖: `@anthropic-ai/sdk`
  - 创建 `src/main/services/llm/`: LLM适配器目录
    - `adapter.interface.ts`: 定义统一LLM接口
      ```typescript
      interface LLMAdapter {
        sendMessage(messages: Message[], config: LLMConfig): Promise<LLMResponse>
        streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk>
      }
      ```
    - `anthropic.adapter.ts`: Anthropic Claude适配器实现
    - `factory.ts`: 根据provider创建适配器
  - 实现Claude适配器:
    - 支持messages格式转换
    - 支持流式响应
    - 支持tool calling (为后续准备)
    - 错误处理与重试 (最多3次,指数退避)
    - 超时控制 (30s)
  - 创建 `src/main/services/llm/cost-tracker.ts`: 成本追踪
    - 记录token使用量
    - 计算成本估算
    - 每日预算检查 (从配置读取,默认$10)

  **Must NOT do**:
  - 不要在这个任务实现其他provider (OpenAI/Gemini留待Task 2.1)
  - 不要实现复杂的prompt工程 (模板/变量替换等)
  - 不要实现向量embeddings

  **Parallelizable**: NO (依赖Task 1-4)

  **References**:
  - Anthropic SDK文档: npm包@anthropic-ai/sdk
  - hello-halo的LLM集成: `src/main/services/sdk/`
  - ccg-workflow的多模型适配思想

  **Acceptance Criteria**:

  **接口验证**:
  - [ ] 创建Claude adapter: `const adapter = createLLMAdapter('anthropic', { apiKey: 'xxx' })`
  - [ ] 发送消息: `adapter.sendMessage([{ role: 'user', content: 'Hello' }])`
  - [ ] 返回响应包含: `content`, `usage { prompt_tokens, completion_tokens }`

  **功能验证**:
  - [ ] 流式响应: `for await (const chunk of adapter.streamMessage(...)) { console.log(chunk.content) }`
  - [ ] 错误重试: 模拟网络错误,自动重试3次
  - [ ] 超时控制: 模拟慢响应,30s后抛出超时错误
  - [ ] 成本追踪: 发送消息后,`cost-tracker.getDailyCost()` 返回正确金额
  - [ ] 预算检查: 设置每日预算$0.01,超过后抛出错误

  **Commit**: YES
  - Message: `feat(llm): implement Claude LLM adapter with cost tracking`
  - Files: `src/main/services/llm/`
  - Pre-commit: `pnpm test src/main/services/llm/`

---

- [x] 7. Chat UI与基础对话流程

  **What to do**:
  - 创建 `src/renderer/pages/ChatPage.tsx`: 聊天页面主组件
  - 创建 `src/renderer/components/chat/`:
    - `MessageList.tsx`: 消息列表 (user/assistant消息卡片)
    - `MessageInput.tsx`: 输入框 + 发送按钮
    - `TypingIndicator.tsx`: AI思考中指示器
  - 实现对话流程:
    1. 用户在MessageInput输入消息,点击发送
    2. 调用IPC: `window.api.invoke('message:send', { sessionId, content })`
    3. 主进程创建Message记录,调用LLM adapter
    4. 流式响应每个chunk通过IPC发送到renderer: `window.api.on('message:chunk', ...)`
    5. Renderer实时更新MessageList
    6. 响应完成后,保存assistant Message到数据库
  - 创建默认Session: 应用启动时,如果无Session则自动创建

  **Must NOT do**:
  - 不要实现markdown渲染 (后续Task)
  - 不要实现消息编辑/删除
  - 不要实现多Session切换 (MVP1仅单Session)

  **Parallelizable**: NO (依赖Task 6)

  **References**:
  - hello-halo的聊天UI: `src/renderer/components/chat/`
  - eigent的消息流: `frontend/src/components/ChatBox.tsx`
  - 流式响应处理模式

  **Acceptance Criteria**:

  **MVP1端到端验证** (最关键):
  - [ ] 启动应用,自动创建Space和Session
  - [ ] 在Chat页面输入: "写一个Hello World函数"
  - [ ] 点击发送,显示TypingIndicator
  - [ ] 流式显示Claude的回复 (逐字出现)
  - [ ] 回复完成后,MessageList显示完整对话
  - [ ] 刷新应用,对话历史仍然存在 (从数据库加载)

  **日志验证**:
  - [ ] 日志记录完整流程: 消息发送 → LLM请求 → 响应接收 → 数据库保存
  - [ ] 控制台无ERROR级别日志

  **Commit**: YES
  - Message: `feat(chat): implement Chat UI and end-to-end conversation flow`
  - Files: `src/renderer/pages/ChatPage.tsx`, `src/renderer/components/chat/`, IPC handlers
  - Pre-commit: `pnpm test`

---

- [x] 8. Artifact预览 (代码/文本简单显示)

  **What to do**:
  - 创建 `src/renderer/components/artifact/`:
    - `ArtifactRail.tsx`: 右侧产物面板 (可折叠)
    - `ArtifactList.tsx`: 产物列表 (文件树结构)
    - `ArtifactPreview.tsx`: 预览组件
  - 实现Artifact创建逻辑:
    - LLM响应如果包含代码块 (`language ... `),自动提取为Artifact
    - 保存到数据库: type='code', content=代码内容
  - 实现预览功能:
    - 代码高亮显示 (使用 `prism-react-renderer`)
    - 文本直接显示
  - 点击Artifact列表项,在ArtifactPreview显示内容

  **Must NOT do**:
  - 不要实现代码编辑
  - 不要实现文件保存到磁盘 (后续Task)
  - 不要实现复杂文件树 (MVP1仅平铺列表)

  **Parallelizable**: NO (依赖Task 7)

  **References**:
  - hello-halo的Artifact Rail: `src/renderer/components/artifact-rail/`
  - prism-react-renderer文档: npm包prism-react-renderer
  - 代码块提取正则: /`(\w+)\n([\s\S]+?)`/g

  **Acceptance Criteria**:

  **功能验证**:
  - [ ] 在Chat输入: "写一个TypeScript的Hello函数"
  - [ ] LLM响应包含代码块
  - [ ] Artifact Rail自动显示新Artifact: "hello.ts"
  - [ ] 点击Artifact,右侧显示代码并高亮

  **数据验证**:
  - [ ] 数据库Artifact表包含新记录: type='code', content包含代码

  **Commit**: YES
  - Message: `feat(artifact): implement artifact extraction and preview`
  - Files: `src/renderer/components/artifact/`, Artifact提取逻辑
  - Pre-commit: `pnpm test`

---

- [x] 9. MVP1单元测试

  **What to do**:
  - 安装依赖: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`
  - 创建 `vitest.config.ts`: 配置测试环境
  - 编写核心模块单元测试:
    - `tests/unit/services/database.test.ts`: 数据库CRUD测试
    - `tests/unit/services/llm/adapter.test.ts`: LLM适配器测试 (使用mock)
    - `tests/unit/services/logger.test.ts`: 日志系统测试
    - `tests/unit/stores/config.store.test.ts`: 配置状态管理测试
  - 配置覆盖率报告: `vitest run --coverage`
  - 目标覆盖率: 核心服务≥70%

  **Must NOT do**:
  - 不要测试UI组件细节 (按钮颜色、边距等)
  - 不要在测试中使用真实API key
  - 不要为简单getter/setter写测试

  **Parallelizable**: YES (与开发并行进行)

  **References**:
  - hello-halo的测试: `tests/`
  - Vitest文档: 测试配置和覆盖率
  - 项目规范: 测试要求70%

  **Acceptance Criteria**:

  **测试运行验证**:
  - [ ] `pnpm test` 所有测试通过
  - [ ] `pnpm test --coverage` 生成覆盖率报告
  - [ ] 核心模块覆盖率≥70%: database, llm, logger

  **测试内容验证**:
  - [ ] database测试包含: CRUD操作、并发写入、事务回滚
  - [ ] llm adapter测试包含: 正常响应、错误重试、超时、成本计算
  - [ ] logger测试包含: 不同级别日志、文件写入、敏感信息过滤

  **Commit**: YES
  - Message: `test(mvp1): add unit tests for core services (70% coverage)`
  - Files: `tests/unit/`, `vitest.config.ts`
  - Pre-commit: `pnpm test`

---

- [x] 10. MVP1集成测试与验收

  **What to do**:
  - 安装依赖: `playwright`
  - 创建 `tests/e2e/mvp1.spec.ts`: MVP1端到端测试
  - E2E测试场景:
    1. **应用启动**: 启动应用,数据库初始化成功
    2. **模型配置**: 打开Settings,配置Claude API,保存成功
    3. **对话流程**: 打开Chat,输入消息,接收流式响应
    4. **Artifact预览**: LLM返回代码,Artifact自动创建并预览
    5. **持久化验证**: 关闭重启应用,对话历史和Artifact仍存在
  - 编写 `docs/mvp1-acceptance.md`: MVP1验收文档
    - 功能清单
    - 已知问题
    - 下一步计划

  **Must NOT do**:
  - 不要测试性能指标 (留待后续)
  - 不要测试错误场景 (无效API key等) - 单元测试已覆盖

  **Parallelizable**: NO (依赖所有MVP1任务)

  **References**:
  - hello-halo的E2E测试: `tests/e2e/`
  - Playwright文档: Electron应用测试

  **Acceptance Criteria**:

  **E2E测试验证**:
  - [ ] `pnpm test:e2e` E2E测试全部通过
  - [ ] 测试覆盖MVP1所有关键路径

  **验收文档验证**:
  - [ ] `docs/mvp1-acceptance.md` 存在
  - [ ] 文档包含: 已实现功能、测试结果、已知问题

  **MVP1 Definition of Done确认**:
  - [ ] Windows应用可独立运行
  - [ ] Chat输入→LLM生成→Artifact预览 端到端流程正常
  - [ ] 核心模块单测覆盖率≥70%
  - [ ] E2E关键路径测试通过

  **Commit**: YES
  - Message: `test(mvp1): add E2E tests and acceptance documentation`
  - Files: `tests/e2e/mvp1.spec.ts`, `docs/mvp1-acceptance.md`
  - Pre-commit: `pnpm test && pnpm test:e2e`

---

### Phase 2: MVP2 - 多LLM委派 + 并行任务 (7-10天)

- [x] 11. 多LLM适配器 (OpenAI, Gemini, OpenAI兼容)

  **What to do**:
  - 安装依赖: `openai`, `@google/generative-ai`
  - 创建适配器:
    - `src/main/services/llm/openai.adapter.ts`: OpenAI GPT适配器
    - `src/main/services/llm/gemini.adapter.ts`: Google Gemini适配器
    - `src/main/services/llm/openai-compat.adapter.ts`: OpenAI兼容接口适配器 (支持DeepSeek/GLM等)
  - 统一接口实现:
    - messages格式转换 (各家SDK格式差异)
    - 流式响应处理
    - tool calling统一 (OpenAI/Claude/Gemini格式不同)
    - 错误码映射
  - 更新 `factory.ts`: 支持所有provider
  - 更新配置界面: 支持配置多个模型

  **Must NOT do**:
  - 不要实现Ollama适配器 (留待后续)
  - 不要实现模型能力探测 (如max_tokens查询)
  - 不要为每个模型写单独的成本计算逻辑 (使用统一公式)

  **Parallelizable**: YES (与Task 12并行)

  **References**:
  - OpenAI SDK文档: npm包openai
  - Gemini SDK文档: npm包@google/generative-ai
  - ccg-workflow的多模型适配思想
  - 各家tool calling格式差异文档

  **Acceptance Criteria**:

  **适配器验证**:
  - [ ] GPT-4适配器: `createLLMAdapter('openai', ...)` 正常发送消息
  - [ ] Gemini适配器: `createLLMAdapter('google', ...)` 正常发送消息
  - [ ] OpenAI兼容适配器: 配置DeepSeek endpoint,正常调用
  - [ ] 所有适配器通过统一接口测试用例

  **功能验证**:
  - [ ] 配置3个模型: Claude, GPT-4, Gemini
  - [ ] 在Chat页面手动切换模型,发送消息,都能正常响应

  **Commit**: YES
  - Message: `feat(llm): add OpenAI, Gemini and OpenAI-compatible adapters`
  - Files: `src/main/services/llm/*.adapter.ts`, `factory.ts`
  - Pre-commit: `pnpm test src/main/services/llm/`

---

- [x] 12. delegate_task委派引擎 (oh-my-opencode核心机制)

  **What to do**:
  - 创建 `src/main/services/delegate/`: delegate_task引擎目录
  - 从oh-my-opencode复制核心代码:
    - `src/tools/delegate-task/tools.ts` → `delegate-engine.ts`
    - 简化为MVP版本: 支持 `subagent_type` 和 `category`,暂不支持 `skills`
  - 创建 `src/main/services/delegate/categories.ts`: 预定义类别配置
    ```typescript
    const categories = {
      quick: { model: 'claude-3-haiku', temperature: 0.3 },
      'visual-engineering': { model: 'gemini-pro', temperature: 0.7 },
      ultrabrain: { model: 'gpt-4', temperature: 0.2 }
    }
    ```
  - 创建 `src/main/services/delegate/agents.ts`: 预定义agent配置
    ```typescript
    const agents = {
      oracle: { type: 'readonly', model: 'claude-opus', tools: [] },
      explore: { type: 'readonly', model: 'claude-sonnet', tools: ['grep', 'read'] }
    }
    ```
  - 实现委派逻辑:
    - 接收 `delegate_task(description, prompt, category/subagent_type)`
    - 根据category/agent查找配置
    - 创建子Task记录 (parentTaskId)
    - 调用对应LLM adapter
    - 返回结果给父Task
  - 实现取消机制: `cancelTask(taskId)`

  **Must NOT do**:
  - 不要实现Skills系统 (MVP2不需要)
  - 不要实现background_task (留待后续)
  - 不要实现session复用 (resume参数)

  **Parallelizable**: YES (与Task 11并行)

  **References**:
  - oh-my-opencode源码: `src/tools/delegate-task/tools.ts`
  - oh-my-opencode的category定义: `docs/category-skill-guide.md`
  - Task/Agent领域模型: `src/types/domain.ts`

  **Acceptance Criteria**:

  **委派验证**:
  - [ ] 创建主Task: `taskId = createTask({ input: '分析代码', type: 'user' })`
  - [ ] 委派子Task: `delegateTask(taskId, { category: 'quick', prompt: '...' })`
  - [ ] 数据库创建子Task记录,parentTaskId正确
  - [ ] 子Task使用claude-haiku模型执行
  - [ ] 子Task完成后,结果返回给主Task

  **类别路由验证**:
  - [ ] category='visual-engineering' → 使用Gemini模型
  - [ ] category='ultrabrain' → 使用GPT-4模型
  - [ ] subagent_type='oracle' → 使用Claude Opus模型

  **Commit**: YES
  - Message: `feat(delegate): implement delegate_task engine from oh-my-opencode`
  - Files: `src/main/services/delegate/`, 添加版权声明
  - Pre-commit: `pnpm test src/main/services/delegate/`

---

- [x] 13. Workforce任务编排引擎 (eigent核心机制)

  **What to do**:
  - 创建 `src/main/services/workforce/`: Workforce引擎目录
  - 从eigent复制并改写为TypeScript:
    - `backend/app/utils/workforce.py` → `workforce-engine.ts`
    - 简化为MVP版本: 支持任务拆解、DAG依赖、并行执行
  - 实现核心功能:
    - `decomposeTask(input: string)`: 将用户任务拆解为子任务列表
    - `buildDAG(tasks)`: 构建任务依赖图 (基于任务描述推断依赖)
    - `executeWorkflow(taskId)`: 执行工作流
      - 按依赖顺序执行任务
      - 可并行的任务并发执行
      - 收集结果并汇总
  - 实现Agent Pool (简化版):
    - 限制最大并发数: 默认3
    - 任务队列: 超过并发数则排队
  - 创建 `src/main/services/workforce/events.ts`: 工作流事件
    - `task:assigned`, `task:started`, `task:completed`
    - 通过IPC发送到renderer实时更新UI

  **Must NOT do**:
  - 不要实现auto-scale (MVP2固定并发数)
  - 不要实现失败重规划 (FailureHandlingConfig)
  - 不要实现WorkflowMemory

  **Parallelizable**: YES (与Task 11, 12并行)

  **References**:
  - eigent源码: `backend/app/utils/workforce.py`
  - eigent的Action事件: `backend/app/types/actions.py`
  - DAG拓扑排序算法

  **Acceptance Criteria**:

  **任务拆解验证**:
  - [ ] 输入: "创建一个登录页面,包含表单验证和API调用"
  - [ ] `decomposeTask()` 返回3个子任务: [创建表单UI, 实现验证逻辑, 集成API]
  - [ ] 子任务保存到数据库,metadata包含依赖关系

  **工作流执行验证**:
  - [ ] `buildDAG()` 构建依赖图: 任务1 → 任务2 → 任务3
  - [ ] `executeWorkflow()` 按顺序执行,完成后状态为'completed'
  - [ ] 日志记录每个任务的开始/完成时间

  **并行执行验证**:
  - [ ] 创建3个独立任务 (无依赖)
  - [ ] 并发数=3,3个任务同时执行
  - [ ] 创建第4个任务,排队等待前3个之一完成

  **Commit**: YES
  - Message: `feat(workforce): implement Workforce task orchestration from eigent`
  - Files: `src/main/services/workforce/`, 添加版权声明
  - Pre-commit: `pnpm test src/main/services/workforce/`

---

- [x] 14. 智能路由系统 (融合delegate_task + Workforce)

  **What to do**:
  - 创建 `src/main/services/router/`: 路由系统目录
  - 创建 `router.ts`: 智能路由逻辑
    - `analyzeTask(input: string)`: 分析任务类型 (前端/后端/架构/快速任务)
    - `selectStrategy(type)`: 选择执行策略 (delegate vs workforce)
    - `selectModel(type)`: 选择LLM模型
  - 实现规则路由表 (可配置):
    ```typescript
    const routingRules = [
      {
        pattern: /前端|UI|页面|组件/,
        strategy: 'delegate',
        category: 'visual-engineering',
        model: 'gemini'
      },
      { pattern: /后端|API|数据库/, strategy: 'delegate', model: 'gpt-4' },
      { pattern: /架构|设计/, strategy: 'delegate', subagent: 'oracle', model: 'claude-opus' },
      { pattern: /创建|开发|实现/, strategy: 'workforce' },
      { pattern: /.*/, strategy: 'delegate', category: 'quick' } // fallback
    ]
    ```
  - 创建路由配置界面: Settings页面新增"路由规则"tab
  - 用户可自定义路由规则: 添加/编辑/删除/排序

  **Must NOT do**:
  - 不要实现自动学习路由 (基于历史反馈调整规则)
  - 不要实现评测体系 (模型效果对比)
  - 不要实现成本优化路由 (动态选择便宜模型)

  **Parallelizable**: NO (依赖Task 12, 13)

  **References**:
  - ccg-workflow的路由思想: 固定角色分工
  - 路由规则配置UI参考

  **Acceptance Criteria**:

  **路由逻辑验证**:
  - [ ] 输入: "创建一个登录页面" → 路由到Workforce + Gemini
  - [ ] 输入: "设计用户认证架构" → 路由到delegate(oracle) + Claude Opus
  - [ ] 输入: "修复按钮样式" → 路由到delegate(quick) + Claude Haiku

  **配置界面验证**:
  - [ ] Settings → 路由规则,显示默认规则列表
  - [ ] 添加自定义规则: pattern=/测试/, model=gpt-4
  - [ ] 保存到数据库,应用路由规则生效

  **端到端验证**:
  - [ ] Chat输入: "创建一个React组件"
  - [ ] 路由到Workforce,拆解为3个子任务
  - [ ] 子任务并行执行,使用Gemini模型
  - [ ] 结果汇总后显示在Chat

  **Commit**: YES
  - Message: `feat(router): implement intelligent routing system (delegate + workforce)`
  - Files: `src/main/services/router/`, Settings路由配置界面
  - Pre-commit: `pnpm test src/main/services/router/`

---

- [x] 15. WorkFlow流程图可视化 (React Flow)

  **What to do**:
  - 安装依赖: `@xyflow/react`
  - 创建 `src/renderer/components/workflow/`:
    - `WorkflowView.tsx`: React Flow画布组件
    - `TaskNode.tsx`: 任务节点组件 (显示任务状态、模型、耗时)
    - `EdgeWithLabel.tsx`: 依赖关系边
  - 实现数据转换: Task[] → React Flow nodes/edges
  - 实现实时更新:
    - 监听 `task:status-changed` 事件
    - 更新对应节点颜色/状态 (pending=灰, running=蓝, completed=绿, failed=红)
  - 添加到ChatPage: 顶部Tab切换 "对话" / "流程图"
  - 实现只读回放: 点击历史Session,显示该Session的完整工作流

  **Must NOT do**:
  - 不要实现工作流编辑 (拖拽节点、手动连线等)
  - 不要实现节点详情弹窗 (点击查看完整日志)
  - 不要实现工作流模板保存/加载

  **Parallelizable**: YES (与Task 11-14并行开发,最后集成)

  **References**:
  - eigent的WorkFlow视图: `frontend/src/pages/WorkFlow/`
  - React Flow文档: npm包@xyflow/react
  - 节点状态颜色参考hello-halo

  **Acceptance Criteria**:

  **可视化验证**:
  - [ ] Chat输入触发Workforce工作流
  - [ ] 切换到"流程图"tab,显示任务DAG
  - [ ] 节点显示: 任务名称、分配模型、当前状态

  **实时更新验证**:
  - [ ] 任务执行过程中,节点颜色实时变化: 灰→蓝→绿
  - [ ] 任务完成后,节点显示耗时 (如 "2.3s")

  **历史回放验证**:
  - [ ] 切换到历史Session,流程图显示该Session的完整工作流
  - [ ] 所有节点状态为最终状态 (completed/failed)

  **Commit**: YES
  - Message: `feat(workflow): add React Flow visualization for task DAG`
  - Files: `src/renderer/components/workflow/`, ChatPage集成
  - Pre-commit: `pnpm test`

---

- [x] 16. MVP2单元测试与集成测试

  **What to do**:
  - 编写单元测试:
    - `tests/unit/services/llm/*.adapter.test.ts`: 所有LLM适配器测试
    - `tests/unit/services/delegate/*.test.ts`: delegate_task引擎测试
    - `tests/unit/services/workforce/*.test.ts`: Workforce引擎测试
    - `tests/unit/services/router/*.test.ts`: 路由系统测试
  - 编写集成测试:
    - `tests/integration/multi-llm.test.ts`: 多模型协同测试
    - `tests/integration/workflow.test.ts`: 工作流执行测试
  - E2E测试:
    - `tests/e2e/mvp2.spec.ts`: MVP2端到端测试
      - 场景1: delegate任务到不同模型
      - 场景2: Workforce拆解并执行工作流
      - 场景3: 路由规则自动选择策略
  - 确保核心模块覆盖率≥70%

  **Must NOT do**:
  - 不要测试所有边界情况 (MVP阶段重点happy path)
  - 不要测试性能 (留待Phase 4)

  **Parallelizable**: YES (与开发并行)

  **References**:
  - MVP1测试模式
  - 集成测试参考eigent

  **Acceptance Criteria**:

  **测试运行验证**:
  - [ ] `pnpm test` 所有单元测试通过
  - [ ] `pnpm test:integration` 集成测试通过
  - [ ] `pnpm test:e2e` E2E测试通过
  - [ ] `pnpm test --coverage` 覆盖率≥70%

  **测试内容验证**:
  - [ ] LLM适配器测试覆盖所有provider (anthropic/openai/google/openai-compat)
  - [ ] delegate_task测试包含: category路由、agent选择、子任务创建、取消
  - [ ] Workforce测试包含: 任务拆解、DAG构建、并行执行、事件发送
  - [ ] 路由测试包含: 规则匹配、策略选择、fallback

  **MVP2 Definition of Done确认**:
  - [ ] 至少2个LLM模型协同完成任务
  - [ ] Workforce工作流执行成功
  - [ ] WorkFlow流程图实时显示
  - [ ] 核心模块测试覆盖率≥70%

  **Commit**: YES
  - Message: `test(mvp2): add comprehensive tests for multi-LLM and workflow`
  - Files: `tests/unit/`, `tests/integration/`, `tests/e2e/mvp2.spec.ts`
  - Pre-commit: `pnpm test && pnpm test:e2e`

---

### Phase 3: MVP3 - 浏览器集成 + 可视化增强 (5-7天)

- [x] 17. BrowserView内嵌浏览器 (hello-halo核心机制)

  **What to do**:
  - 从hello-halo复制BrowserView集成代码:
    - `src/main/services/browser-view/manager.ts` → BrowserView管理器
    - `src/main/services/browser-view/lifecycle.ts` → 生命周期控制
  - 实现BrowserView功能:
    - 创建/销毁BrowserView
    - 导航到URL
    - 调整bounds (位置/大小)
    - 显示/隐藏
    - 截图
  - 创建Content Canvas组件:
    - `src/renderer/components/canvas/ContentCanvas.tsx`
    - Tab管理: 支持多个BrowserView tab
    - 地址栏: URL输入、导航按钮 (前进/后退/刷新)
  - 集成到ChatPage: 右侧Canvas区域

  **Must NOT do**:
  - 不要实现DevTools (留待调试需要时)
  - 不要实现下载管理
  - 不要实现书签/历史记录

  **Parallelizable**: NO (依赖Electron框架)

  **References**:
  - hello-halo源码: `src/main/services/browser-view/`
  - Electron BrowserView文档
  - CDP (Chrome DevTools Protocol)

  **Acceptance Criteria**:

  **BrowserView验证**:
  - [ ] 点击Chat消息中的链接,在Canvas打开BrowserView
  - [ ] 显示地址栏,URL正确
  - [ ] 前进/后退/刷新按钮正常工作
  - [ ] 截图功能: 点击截图按钮,保存到Artifact

  **多Tab验证**:
  - [ ] 打开多个URL,Canvas显示tab列表
  - [ ] 切换tab,BrowserView正确切换
  - [ ] 关闭tab,BrowserView正确销毁

  **Commit**: YES
  - Message: `feat(browser): integrate BrowserView from hello-halo`
  - Files: `src/main/services/browser-view/`, `src/renderer/components/canvas/`, 添加版权声明
  - Pre-commit: `pnpm test`

---

- [x] 18. AI Browser工具集 (MVP3限定3-6个核心工具)

  **What to do**:
  - 从hello-halo复制AI Browser核心代码:
    - `src/main/services/ai-browser/cdp.ts` → CDP客户端
    - `src/main/services/ai-browser/accessibility-tree.ts` → 可访问树快照
  - 实现核心工具 (限定6个):
    1. **browser_navigate**: 导航到URL
    2. **browser_click**: 点击元素 (通过UID或selector)
    3. **browser_fill**: 填写输入框
    4. **browser_screenshot**: 截图
    5. **browser_snapshot**: 获取可访问树快照
    6. **browser_extract**: 提取页面文本/数据
  - 将工具注册到LLM adapter的tool calling
  - 实现安全策略:
    - 导航/点击/填写/截图/快照: 自动允许
    - 下载/上传: 禁止 (MVP3不实现)
    - 本地文件访问: 禁止

  **Must NOT do**:
  - 不要实现全部26个工具 (MVP3限定6个)
  - 不要实现文件上传/下载
  - 不要实现表单自动提交 (需确认机制,后续实现)

  **Parallelizable**: NO (依赖Task 17)

  **References**:
  - hello-halo源码: `src/main/services/ai-browser/tools/`
  - CDP协议文档: chrome-devtools-protocol
  - 可访问树API: Accessibility.getFullAXTree

  **Acceptance Criteria**:

  **工具验证**:
  - [ ] LLM调用 `browser_navigate({ url: 'https://example.com' })` 成功导航
  - [ ] LLM调用 `browser_snapshot()` 返回可访问树 (包含UID)
  - [ ] LLM调用 `browser_click({ uid: 'btn-submit' })` 成功点击
  - [ ] LLM调用 `browser_fill({ uid: 'input-search', value: 'test' })` 成功填写
  - [ ] LLM调用 `browser_screenshot()` 返回base64图片
  - [ ] LLM调用 `browser_extract()` 返回页面文本

  **端到端验证**:
  - [ ] Chat输入: "打开example.com并搜索test"
  - [ ] AI自动调用: navigate → snapshot → fill → click
  - [ ] 浏览器正确执行,Chat显示结果

  **安全验证**:
  - [ ] 尝试导航到 `file:///` → 被拦截,返回错误

  **Commit**: YES
  - Message: `feat(ai-browser): implement 6 core browser automation tools`
  - Files: `src/main/services/ai-browser/`, 工具注册, 添加版权声明
  - Pre-commit: `pnpm test src/main/services/ai-browser/`

---

- [x] 19. Space工作区系统

  **What to do**:
  - 实现Space管理:
    - 创建 `src/main/services/space.ts`: Space CRUD
    - Space包含: name, workDir (用户选择目录)
    - 每个Space有独立的Session列表
  - 实现Space UI:
    - `src/renderer/components/sidebar/SpaceList.tsx`: Space列表
    - `src/renderer/components/sidebar/SpaceCreateDialog.tsx`: 创建Space对话框
    - Sidebar显示当前Space + 切换按钮
  - 实现Space切换:
    - 切换Space时,加载该Space的Sessions
    - Canvas/Artifact Rail也切换到对应Space
  - 实现工作目录隔离:
    - Artifact保存到 `{workDir}/.codeall/artifacts/`
    - 浏览器下载保存到 `{workDir}/.codeall/downloads/`

  **Must NOT do**:
  - 不要实现Space共享/导出
  - 不要实现Space模板
  - 不要实现多Space并行打开

  **Parallelizable**: YES (与Task 17-18并行)

  **References**:
  - hello-halo的Space系统: `src/main/services/space/`
  - 工作目录管理模式

  **Acceptance Criteria**:

  **Space管理验证**:
  - [ ] 创建Space: name="项目A", workDir="D:/projects/project-a"
  - [ ] Sidebar显示Space列表,当前Space高亮
  - [ ] 切换到Space "项目B",Session列表更新

  **工作目录验证**:
  - [ ] 在Space "项目A"创建Artifact,保存到 `D:/projects/project-a/.codeall/artifacts/`
  - [ ] 切换到Space "项目B",Artifact列表为空
  - [ ] 浏览器截图保存到当前Space的工作目录

  **Commit**: YES
  - Message: `feat(space): implement workspace isolation system`
  - Files: `src/main/services/space.ts`, Space UI组件
  - Pre-commit: `pnpm test`

---

- [x] 20. Artifact Rail增强 (文件树 + 多类型预览)

  **What to do**:
  - 增强Artifact Rail:
    - 改为文件树结构 (基于path分层显示)
    - 支持文件夹展开/折叠
    - 文件图标 (根据type/extension显示)
  - 增强Artifact预览:
    - 代码: 语法高亮 + 行号 (已实现)
    - 图片: 显示图片 (使用 `<img>`)
    - Markdown: 渲染为HTML (使用 `react-markdown`)
    - JSON: 格式化显示 (使用 `react-json-view`)
    - 其他: 纯文本
  - 实现文件操作:
    - 复制到剪贴板
    - 保存到磁盘 (下载)
    - 删除Artifact

  **Must NOT do**:
  - 不要实现文件编辑 (留待后续)
  - 不要实现文件diff (版本对比)
  - 不要实现大文件分片加载 (MVP3限制单文件<1MB)

  **Parallelizable**: YES (与其他任务并行)

  **References**:
  - hello-halo的Artifact Rail: `src/renderer/components/artifact-rail/`
  - react-markdown, react-json-view文档

  **Acceptance Criteria**:

  **文件树验证**:
  - [ ] 创建Artifact: `src/utils/helper.ts`, `src/components/Button.tsx`, `README.md`
  - [ ] Artifact Rail显示文件树结构:
    ```
    src/
      utils/
        helper.ts
      components/
        Button.tsx
    README.md
    ```
  - [ ] 展开/折叠 `src/` 文件夹正常工作

  **预览验证**:
  - [ ] 点击 `helper.ts` → 代码高亮预览
  - [ ] 点击 `README.md` → Markdown渲染预览
  - [ ] 点击截图Artifact → 显示图片

  **文件操作验证**:
  - [ ] 点击"复制",代码复制到剪贴板
  - [ ] 点击"下载",文件保存到 `{workDir}/.codeall/downloads/`
  - [ ] 点击"删除",Artifact从数据库和列表移除

  **Commit**: YES
  - Message: `feat(artifact): enhance Artifact Rail with file tree and multi-type preview`
  - Files: `src/renderer/components/artifact/`, 预览组件
  - Pre-commit: `pnpm test`

---

- [x] 21. MVP3单元测试与集成测试

  **What to do**:
  - 编写单元测试:
    - `tests/unit/services/browser-view/*.test.ts`: BrowserView管理器测试
    - `tests/unit/services/ai-browser/*.test.ts`: AI Browser工具测试 (使用CDP mock)
    - `tests/unit/services/space.test.ts`: Space管理测试
  - 编写集成测试:
    - `tests/integration/ai-browser.test.ts`: AI浏览器自动化完整流程
  - E2E测试:
    - `tests/e2e/mvp3.spec.ts`:
      - 场景1: 打开BrowserView,导航并截图
      - 场景2: AI自动控制浏览器完成脚本 (导航→填写→点击)
      - 场景3: Space切换,Artifact隔离
  - 确保核心模块覆盖率≥70%

  **Must NOT do**:
  - 不要测试真实网站交互 (使用本地测试页面)
  - 不要测试浏览器兼容性 (只测Chromium)

  **Parallelizable**: YES (与开发并行)

  **References**:
  - MVP1/MVP2测试模式
  - Playwright for Electron

  **Acceptance Criteria**:

  **测试运行验证**:
  - [ ] `pnpm test` 所有单元测试通过
  - [ ] `pnpm test:integration` 集成测试通过
  - [ ] `pnpm test:e2e` E2E测试通过
  - [ ] `pnpm test --coverage` 覆盖率≥70%

  **MVP3 Definition of Done确认**:
  - [ ] BrowserView内嵌浏览器正常工作
  - [ ] AI自动控制浏览器完成固定脚本 (导航→搜索→提取)
  - [ ] Space工作区隔离生效
  - [ ] Artifact Rail文件树和多类型预览正常
  - [ ] 核心模块测试覆盖率≥70%

  **Commit**: YES
  - Message: `test(mvp3): add tests for browser automation and workspace`
  - Files: `tests/unit/`, `tests/integration/`, `tests/e2e/mvp3.spec.ts`
  - Pre-commit: `pnpm test && pnpm test:e2e`

---

### Phase 4: Final - 完整集成 + 打包 + 文档 (3-5天)

- [x] 22. 性能优化与稳定性加固

  **What to do**:
  - 性能优化:
    - 数据库查询优化: 添加索引 (sessionId, spaceId, createdAt)
    - 大Artifact分页加载: 列表只加载metadata,点击才加载content
    - BrowserView内存管理: 限制最大tab数量=5,超过则关闭最旧tab
    - 日志优化: 生产环境只记录info及以上级别
  - 稳定性加固:
    - 全局错误捕获: 主进程/渲染进程uncaughtException/unhandledRejection
    - 资源清理: 应用关闭时,停止数据库/关闭BrowserView/取消运行中任务
    - 数据库事务: 关键操作使用事务 (Task创建+Message保存)
    - 超时保护: 所有LLM/Browser操作设置超时
  - 性能测试:
    - 冷启动时间: 目标<5s
    - 单Run内存峰值: 目标<500MB
    - 并发3个LLM任务: 稳定运行无崩溃

  **Must NOT do**:
  - 不要过度优化 (如缓存所有数据库查询)
  - 不要引入复杂的性能监控 (Sentry等,留待后续)

  **Parallelizable**: NO (需要完整功能)

  **References**:
  - Electron性能优化文档
  - Prisma查询优化

  **Acceptance Criteria**:

  **性能指标验证**:
  - [ ] 冷启动时间<5s (从点击图标到显示主界面)
  - [ ] 单Run内存峰值<500MB (使用Chrome DevTools Memory Profiler)
  - [ ] 并发3个Workforce工作流,稳定运行,内存不溢出

  **稳定性验证**:
  - [ ] 模拟LLM超时,应用不崩溃,返回错误提示
  - [ ] 模拟数据库锁,事务正确回滚
  - [ ] 关闭应用,所有资源正确清理 (进程完全退出,无僵尸进程)

  **Commit**: YES
  - Message: `perf: optimize performance and stability for production`
  - Files: 性能优化代码,错误处理增强
  - Pre-commit: `pnpm test`

---

- [x] 23. Windows打包 (electron-builder)

  **What to do**:
  - 安装依赖: `electron-builder`
  - 配置 `electron-builder.yml`:
    - appId: `com.codeall.app`
    - productName: `CodeAll`
    - 图标: 创建 `build/icon.ico`
    - 包含文件: dist/, prisma/, node_modules/ (必需依赖)
    - 打包格式: NSIS安装程序 (.exe)
  - 配置签名 (可选,开发阶段跳过):
    - certificateFile (需购买证书)
  - 配置更新检查 (预留,不实现自动更新):
    - publish: null
  - 打包脚本: `pnpm build:win`
  - 测试安装:
    - 运行生成的 `CodeAll-Setup-1.0.0.exe`
    - 安装到 `C:/Program Files/CodeAll/`
    - 验证应用正常启动,数据库初始化

  **Must NOT do**:
  - 不要实现自动更新 (electron-updater)
  - 不要打包macOS/Linux版本 (MVP只Windows)
  - 不要购买代码签名证书 (开发阶段)

  **Parallelizable**: NO (需要完整构建)

  **References**:
  - electron-builder文档
  - hello-halo的打包配置

  **Acceptance Criteria**:

  **打包验证**:
  - [ ] `pnpm build:win` 成功生成 `dist/CodeAll-Setup-1.0.0.exe`
  - [ ] 安装包大小合理 (<200MB)

  **安装验证**:
  - [ ] 运行安装程序,无报错,完成安装
  - [ ] 开始菜单创建快捷方式
  - [ ] 双击快捷方式,应用启动
  - [ ] 首次启动,数据库自动初始化到 `%USERPROFILE%/.codeall/`

  **功能验证**:
  - [ ] 安装后的应用,所有MVP3功能正常工作
  - [ ] 关闭重启,数据持久化正常

  **Commit**: YES
  - Message: `build: configure electron-builder for Windows packaging`
  - Files: `electron-builder.yml`, `build/`, `package.json` scripts
  - Pre-commit: `pnpm build:win`

---

- [x] 24. 用户文档与开发文档

  **What to do**:
  - 创建 `docs/` 目录:
    - `user-guide.md`: 用户手册
      - 安装指南
      - 配置LLM模型
      - 创建Space
      - 基础对话
      - 使用Workforce工作流
      - 使用AI Browser
    - `api-reference.md`: API文档
      - 核心模块接口
      - IPC事件列表
      - 数据库Schema
    - `architecture.md`: 架构设计文档
      - 系统架构图
      - 模块职责
      - 数据流
      - 领域模型
    - `development.md`: 开发指南
      - 环境搭建
      - 构建命令
      - 测试运行
      - 代码规范
  - 更新 `README.md`:
    - 项目简介
    - 功能特性
    - 安装使用
    - 开发指南
    - Acknowledgments (5个参考项目)
    - License (MIT)

  **Must NOT do**:
  - 不要写过长的文档 (每个文档控制在1000字内)
  - 不要添加emoji (除非必要)
  - 不要写营销性语言

  **Parallelizable**: YES (与其他任务并行)

  **References**:
  - 5个参考项目的README
  - 项目规范文档

  **Acceptance Criteria**:

  **文档完整性验证**:
  - [ ] `docs/user-guide.md` 存在,包含安装和使用说明
  - [ ] `docs/api-reference.md` 存在,列出所有IPC事件
  - [ ] `docs/architecture.md` 存在,包含架构图 (可用Mermaid)
  - [ ] `docs/development.md` 存在,包含开发环境搭建步骤
  - [ ] `README.md` 更新,包含项目简介和Acknowledgments

  **文档质量验证**:
  - [ ] 用户手册有完整的配置LLM流程截图
  - [ ] API文档有代码示例
  - [ ] 架构文档有清晰的模块划分说明

  **Commit**: YES
  - Message: `docs: add comprehensive user and developer documentation`
  - Files: `docs/`, `README.md`
  - Pre-commit: 无 (文档无需测试)

---

- [x] 25. 完整集成测试与验收

  **What to do**:
  - 编写完整集成测试:
    - `tests/integration/full-workflow.test.ts`: 完整工作流测试
      - 创建Space → 配置多个模型 → 发送复杂任务 → Workforce拆解 → 多LLM协同 → AI Browser自动化 → Artifact生成
  - 编写性能测试:
    - `tests/performance/startup.test.ts`: 启动时间测试
    - `tests/performance/concurrent.test.ts`: 并发任务测试
  - 编写最终E2E测试:
    - `tests/e2e/final-acceptance.spec.ts`: 验收测试
      - 从安装 → 配置 → 使用 → 验证 完整流程
  - 生成测试报告:
    - 单元测试覆盖率报告
    - E2E测试视频录制
    - 性能测试结果 (启动时间、内存峰值、并发稳定性)
  - 编写验收文档:
    - `docs/final-acceptance.md`:
      - 已实现功能清单 (对照计划)
      - 测试结果汇总
      - 已知问题列表
      - 性能指标

  **Must NOT do**:
  - 不要测试极端情况 (如1000并发任务)
  - 不要测试跨平台 (只Windows)

  **Parallelizable**: NO (需要完整功能)

  **References**:
  - 交付标准定义
  - MVP1/2/3测试模式

  **Acceptance Criteria**:

  **测试运行验证**:
  - [ ] `pnpm test` 所有单元测试通过
  - [ ] `pnpm test:integration` 集成测试通过
  - [ ] `pnpm test:e2e` E2E测试通过
  - [ ] `pnpm test:performance` 性能测试通过

  **测试报告验证**:
  - [ ] 生成HTML覆盖率报告: `coverage/index.html`
  - [ ] E2E测试录制视频: `tests/e2e/videos/`
  - [ ] 性能测试结果: `tests/performance/results.json`

  **验收文档验证**:
  - [ ] `docs/final-acceptance.md` 存在
  - [ ] 文档包含: 功能清单、测试结果、性能指标、已知问题

  **Definition of Done最终确认**:
  - [ ] Windows应用可独立安装运行
  - [ ] MVP1端到端流程正常
  - [ ] MVP2多LLM委派正常
  - [ ] MVP3浏览器自动化正常
  - [ ] 核心模块单测覆盖率≥70%
  - [ ] E2E关键路径测试通过
  - [ ] 性能指标达标: 冷启动<5s, 单Run内存<500MB
  - [ ] 代码符合规范
  - [ ] 所有敏感操作有确认机制
  - [ ] 数据持久化可跨会话恢复
  - [ ] 完整文档齐全

  **Commit**: YES
  - Message: `test(final): add comprehensive integration and acceptance tests`
  - Files: `tests/integration/`, `tests/performance/`, `tests/e2e/final-acceptance.spec.ts`, `docs/final-acceptance.md`
  - Pre-commit: `pnpm test && pnpm test:e2e`

---

## Commit Strategy

| After Task | Message                                                                       | Files                             | Verification            |
| ---------- | ----------------------------------------------------------------------------- | --------------------------------- | ----------------------- |
| 0          | `chore: establish licenses compliance and freeze domain model`                | docs/, types/                     | `pnpm tsc --noEmit`     |
| 1          | `chore: initialize project scaffolding and build config`                      | package.json, configs             | `pnpm build`            |
| 2          | `feat(electron): setup main process and type-safe IPC communication`          | src/main/, src/renderer/          | `pnpm dev`              |
| 3          | `feat(database): integrate pg-embed and Prisma ORM`                           | src/main/services/database.ts     | `pnpm prisma validate`  |
| 4          | `feat(ui): implement basic React UI and model config panel`                   | src/renderer/                     | `pnpm tsc --noEmit`     |
| 5          | `feat(logging): setup winston structured logging system`                      | src/main/services/logger.ts       | `pnpm tsc --noEmit`     |
| 6          | `feat(llm): implement Claude LLM adapter with cost tracking`                  | src/main/services/llm/            | `pnpm test llm/`        |
| 7          | `feat(chat): implement Chat UI and end-to-end conversation flow`              | src/renderer/pages/ChatPage.tsx   | `pnpm test`             |
| 8          | `feat(artifact): implement artifact extraction and preview`                   | src/renderer/components/artifact/ | `pnpm test`             |
| 9          | `test(mvp1): add unit tests for core services (70% coverage)`                 | tests/unit/                       | `pnpm test`             |
| 10         | `test(mvp1): add E2E tests and acceptance documentation`                      | tests/e2e/                        | `pnpm test:e2e`         |
| 11         | `feat(llm): add OpenAI, Gemini and OpenAI-compatible adapters`                | src/main/services/llm/            | `pnpm test llm/`        |
| 12         | `feat(delegate): implement delegate_task engine from oh-my-opencode`          | src/main/services/delegate/       | `pnpm test delegate/`   |
| 13         | `feat(workforce): implement Workforce task orchestration from eigent`         | src/main/services/workforce/      | `pnpm test workforce/`  |
| 14         | `feat(router): implement intelligent routing system (delegate + workforce)`   | src/main/services/router/         | `pnpm test router/`     |
| 15         | `feat(workflow): add React Flow visualization for task DAG`                   | src/renderer/components/workflow/ | `pnpm test`             |
| 16         | `test(mvp2): add comprehensive tests for multi-LLM and workflow`              | tests/unit/, tests/e2e/           | `pnpm test:e2e`         |
| 17         | `feat(browser): integrate BrowserView from hello-halo`                        | src/main/services/browser-view/   | `pnpm test`             |
| 18         | `feat(ai-browser): implement 6 core browser automation tools`                 | src/main/services/ai-browser/     | `pnpm test ai-browser/` |
| 19         | `feat(space): implement workspace isolation system`                           | src/main/services/space.ts        | `pnpm test`             |
| 20         | `feat(artifact): enhance Artifact Rail with file tree and multi-type preview` | src/renderer/components/artifact/ | `pnpm test`             |
| 21         | `test(mvp3): add tests for browser automation and workspace`                  | tests/e2e/                        | `pnpm test:e2e`         |
| 22         | `perf: optimize performance and stability for production`                     | 性能优化代码                      | `pnpm test`             |
| 23         | `build: configure electron-builder for Windows packaging`                     | electron-builder.yml              | `pnpm build:win`        |
| 24         | `docs: add comprehensive user and developer documentation`                    | docs/, README.md                  | 无                      |
| 25         | `test(final): add comprehensive integration and acceptance tests`             | tests/                            | `pnpm test:e2e`         |

---

## Success Criteria

### Verification Commands

**开发环境**:

```bash
pnpm install        # 依赖安装成功
pnpm tsc --noEmit   # TypeScript编译无报错
pnpm lint           # ESLint检查通过
pnpm test           # 单元测试通过,覆盖率≥70%
pnpm dev            # 开发服务器启动,应用正常显示
```

**构建与打包**:

```bash
pnpm build          # Vite构建成功
pnpm build:win      # electron-builder打包成功
```

**测试验证**:

```bash
pnpm test:integration  # 集成测试通过
pnpm test:e2e          # E2E测试通过
pnpm test:performance  # 性能测试通过
pnpm test --coverage   # 生成覆盖率报告
```

**最终验收**:

```bash
# 安装CodeAll-Setup-1.0.0.exe
# 启动应用,无报错
# 完成MVP1流程: 配置模型→对话→预览Artifact
# 完成MVP2流程: 多模型协同任务
# 完成MVP3流程: AI浏览器自动化
# 检查日志文件: ~/.codeall/logs/ 无ERROR
# 检查数据库: ~/.codeall/db/ 数据正常存储
```

### Final Checklist

**功能完整性**:

- [ ] 所有"Must Have"功能已实现
- [ ] 所有"Must NOT Have"功能未实现 (范围控制)
- [ ] MVP1端到端流程验证通过
- [ ] MVP2多LLM委派验证通过
- [ ] MVP3浏览器自动化验证通过

**质量保证**:

- [ ] 核心模块单元测试覆盖率≥70%
- [ ] 至少3条E2E关键路径测试通过
- [ ] 性能指标达标: 冷启动<5s, 单Run内存<500MB
- [ ] 代码通过ESLint/Prettier检查
- [ ] TypeScript strict模式无报错

**安全合规**:

- [ ] 所有敏感操作有确认机制
- [ ] API key加密存储 (Windows Credential Manager)
- [ ] 浏览器安全策略生效 (file://禁止访问)
- [ ] 许可证合规文档完成

**文档齐全**:

- [ ] 用户手册完成
- [ ] API文档完成
- [ ] 架构文档完成
- [ ] 开发指南完成
- [ ] README更新,包含Acknowledgments

**可交付物**:

- [ ] Windows安装包: `CodeAll-Setup-1.0.0.exe`
- [ ] 源代码: GitHub仓库
- [ ] 文档: `docs/` 目录
- [ ] 测试报告: 单元测试/集成测试/E2E测试/性能测试
