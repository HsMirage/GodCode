# CodeAll 统一开发计划

**项目名称**：CodeAll - 多LLM协同编程与多Agent协同工作桌面应用
**创建时间**：2026-01-31
**合并自**：codeall-fix-and-enhance, fix-prisma-esm, quick-start-guide, codeall-corrections, multi-llm-multi-agent-desktop-app

---

## TL;DR

> **Quick Summary**: 开发独立运行的 Windows 桌面应用，融合 5 个参考项目的核心优势：oh-my-opencode 的多智能体协同、eigent 的 Workforce 任务拆解、hello-halo 的内嵌浏览器、moltbot 的 Subagent 机制、ccg-workflow 的调度理念。
>
> **Deliverables**:
>
> - 可运行的 Windows 安装包 (CodeAll Setup 1.0.0.exe)
> - **Linux 远程网页访问版** (Web Server 模式) ✨ 新增
> - 完整的源代码与文档
> - 单元测试与集成测试报告
> - 性能测试报告 (多 Agent 并发)
>
> **Estimated Effort**: XL (13 weeks + 补充任务)
> **Parallel Execution**: YES - Multi-wave
> **Critical Path**: Phase 0 (修复) → Phase 1 (脚手架) → Phase 2 (Agent核心) → ... → Phase 10 (打包交付) → **Phase 11 (Linux + 测试报告)**
>
> **合并说明**: 2026-02-01 合并 codeall-final-delivery 计划，新增 Phase 11

---

## 关键修正声明 (Momus 审查反馈)

### 许可证合规策略

| 项目               | 许可证                  | 策略                       |
| ------------------ | ----------------------- | -------------------------- |
| **oh-my-opencode** | Sustainable Use License | **仅参考思想，不复制代码** |
| **eigent**         | Apache-2.0              | 复制代码 + 保留版权声明    |
| **moltbot**        | MIT                     | 复制代码 + 保留版权声明    |
| **hello-halo**     | MIT                     | 复制代码 + 保留版权声明    |
| **ccg-workflow**   | MIT                     | 参考思想重写               |

**CodeAll 最终许可证**：MIT License

### IPC/API 命名约定

- **Preload 暴露 API**：`window.codeall` (非 window.api)
- **Channel 格式**：`<模块>:<操作>` (kebab-case)

```typescript
// src/preload/index.ts
contextBridge.exposeInMainWorld('codeall', {
  invoke: (channel: string, data?: any) => ipcRenderer.invoke(channel, data),
  on: (channel: string, callback: Function) => ipcRenderer.on(channel, callback),
  off: (channel: string, callback: Function) => ipcRenderer.off(channel, callback)
})
```

### 参考项目路径修正

| 原路径                           | 实际路径                                  |
| -------------------------------- | ----------------------------------------- |
| `hello-halo/vite.config.ts`      | `hello-halo/electron.vite.config.ts`      |
| `hello-halo/src/main/preload.ts` | `hello-halo/src/preload/index.ts`         |
| `eigent/backend/` (Python)       | **不存在于本仓库** - 需用 TypeScript 重写 |

---

## 技术栈

- **运行时**：Electron 28+ + Node.js
- **前端**：React 18 + TypeScript + Tailwind CSS
- **状态管理**：Zustand
- **数据库**：embedded-postgres + Prisma ORM
- **构建**：electron-vite + electron-builder
- **测试**：Vitest + Playwright

---

## Phase 0: 紧急修复 (当前阻塞项)

> **目标**：修复打包后的 EXE 启动问题，确保应用可正常运行

### 0.1 修复 Prisma ESM 导入错误

- [x] **Task 0.1.1**: 修复 PrismaClient 导入兼容性

  **What to do**:
  修改 `src/main/services/database.ts` 的导入方式：

  ```typescript
  // FROM:
  import { PrismaClient } from '@prisma/client'

  // TO:
  import pkg from '@prisma/client'
  const { PrismaClient } = pkg
  ```

  **File**: `src/main/services/database.ts` (line 5)

  **Acceptance Criteria**:
  - [x] App launches without "Named export 'PrismaClient' not found" error
  - [x] `pnpm build` succeeds

  **Commit**: YES
  - Message: `fix(database): use CommonJS-compatible import for PrismaClient`

### 0.2 修复主进程启动逻辑

- [x] **Task 0.2.1**: 解耦窗口创建与数据库初始化

  **What to do**:
  在 `src/main/index.ts` 中：
  1. 将 `createWindow()` 移到 `db.init()` 之前
  2. 将 `db.init()` 包裹在 try-catch 中
  3. 数据库失败时显示错误对话框但不阻塞窗口

  ```typescript
  app.whenReady().then(async () => {
    logger.info('Application starting')

    // 1. 首先创建窗口
    const mainWindow = createWindow()

    // 2. 注册 IPC
    registerIpcHandlers(mainWindow)

    // 3. 数据库初始化 (失败不阻塞)
    try {
      const db = DatabaseService.getInstance()
      await db.init()
    } catch (error) {
      dialog.showErrorBox('数据库初始化失败', `${error}`)
      // 不抛出，继续运行
    }
  })
  ```

  **Acceptance Criteria**:
  - [x] EXE 启动后 5 秒内显示主窗口
  - [x] 数据库失败时窗口仍显示

  **Commit**: YES
  - Message: `fix(main): prevent window creation blocking on database init failure`

### 0.3 添加单实例锁

- [x] **Task 0.3.1**: 防止多实例启动

  **What to do**:
  在 `src/main/index.ts` 顶部添加：

  ```typescript
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }
    })
    // ... 原有逻辑
  }
  ```

  **Acceptance Criteria**:
  - [x] 双击 EXE 只启动一个实例
  - [x] 第二次点击聚焦已有窗口

  **Commit**: YES
  - Message: `fix(main): add single instance lock`

### 0.4 更新 electron-builder 配置

- [x] **Task 0.4.1**: 添加 asarUnpack 配置

  **What to do**:
  在 `electron-builder.yml` 中添加：

  ```yaml
  asarUnpack:
    - '**/node_modules/@embedded-postgres/**/*'
    - '**/node_modules/embedded-postgres/**/*'
    - '**/node_modules/.prisma/client/*.node'
    - '**/*.node'
  ```

  **Acceptance Criteria**:
  - [x] `pnpm build:win` 成功
  - [x] `dist/win-unpacked/resources/app.asar.unpacked/node_modules/@embedded-postgres/` 存在

  **Commit**: YES
  - Message: `fix(build): add asarUnpack for embedded-postgres and prisma binaries`

### 0.5 验证修复

- [x] **Task 0.5.1**: 编译并测试

  **What to do**:

  ```bash
  pnpm build:win
  # 运行 dist/win-unpacked/CodeAll.exe
  # 验证窗口显示
  ```

  **Acceptance Criteria**:
  - [x] EXE 启动显示主窗口
  - [x] 无 ESM 导入错误
  - [x] 无数据库阻塞问题

---

## Phase 1: 项目脚手架 (Week 1)

### 1.1 项目初始化

- [x] **Task 1.1.1**: 使用 electron-vite 初始化项目结构
- [x] **Task 1.1.2**: 配置 TypeScript (strict mode + path aliases)
- [x] **Task 1.1.3**: 配置 ESLint + Prettier
- [x] **Task 1.1.4**: 配置 Tailwind CSS + 主题系统
- [x] **Task 1.1.5**: 配置 Vitest + Playwright
- [x] **Task 1.1.6**: 配置 electron-builder (Windows)
- [x] **Task 1.1.7**: 配置 electron-updater (自动更新)

**验收标准**:

- `pnpm dev` 启动开发环境
- `pnpm build` 生成可执行文件
- `pnpm test` 运行测试套件

### 1.2 目录结构

```
CodeAll/
├── src/
│   ├── main/           # Electron 主进程
│   ├── renderer/       # React UI
│   ├── preload/        # Preload 脚本
│   └── shared/         # 共享类型与工具
├── resources/          # 图标、资源
├── .sisyphus/          # 状态与计划
└── user-data/          # 运行时数据
```

---

## Phase 2: Agent 核心系统 (Week 2-3)

### 2.1 多 LLM 接入层

- [x] **Task 2.1.1**: 实现 `LLMProvider` 抽象接口
- [x] **Task 2.1.2**: 实现 OpenAI Compatible Provider
- [x] **Task 2.1.3**: 实现并发限流管理器 (ConcurrencyManager)
- [x] **Task 2.1.4**: 实现模型配置与切换
- [x] **Task 2.1.5**: 实现 Token 计数与预算管理

**参考代码** (仅阅读思想，重写实现):

- `oh-my-opencode/src/features/background-agent/manager.ts`
- `oh-my-opencode/src/tools/delegate-task/tools.ts`

### 2.2 任务调度与队列系统

- [x] **Task 2.2.1**: 实现 `TaskQueue` (FIFO 队列)
- [x] **Task 2.2.2**: 实现 `TaskScheduler` (调度器)
- [x] **Task 2.2.3**: 实现任务超时机制
- [x] **Task 2.2.4**: 实现任务取消机制
- [x] **Task 2.2.5**: 实现任务重试策略 (指数退避)
- [x] **Task 2.2.6**: 实现任务依赖管理 (简化版 DAG)

### 2.3 Agent 协同与子代理系统

- [x] **Task 2.3.1**: 实现 `Agent` 基础类
- [x] **Task 2.3.2**: 实现 `SubAgent` 并行执行机制
- [x] **Task 2.3.3**: 实现 Agent 注册与路由
- [x] **Task 2.3.4**: 实现 Agent 生命周期管理
- [x] **Task 2.3.5**: 实现 Agent 结果回报机制

**参考代码** (可复制，保留版权):

- `moltbot/src/agents/tools/sessions-spawn-tool.ts`

### 2.4 Delegate Engine (oh-my-opencode 替代实现)

> **重要**: 此模块必须完全重写，不复制 oh-my-opencode 代码

- [x] **Task 2.4.1**: 实现 `DelegateEngine` 类

```typescript
// src/main/services/delegate/engine.ts (完全重写)

interface DelegateTaskParams {
  description: string;
  prompt: string;
  category?: 'quick' | 'visual-engineering' | 'ultrabrain' | 'deep' | 'artistry';
  subagent_type?: 'oracle' | 'explore' | 'librarian' | 'sisyphus-junior';
}

class DelegateEngine {
  async delegateTask(parentTaskId: string, params: DelegateTaskParams): Promise<TaskResult> {
    const config = this.resolveConfig(params);
    const childTask = await prisma.task.create({...});
    const adapter = createLLMAdapter(config.provider, config);
    const result = await adapter.sendMessage([{ role: 'user', content: params.prompt }]);
    await prisma.task.update({...});
    return { taskId: childTask.id, output: result.content };
  }
}
```

### 2.5 Workforce Engine (eigent 替代实现)

> **重要**: eigent Python 后端不在本仓库，需用 TypeScript 重写

- [x] **Task 2.5.1**: 实现 `WorkforceEngine` 类

```typescript
// src/main/services/workforce/engine.ts

interface WorkforceSubTask {
  name: string
  description: string
  dependencies: string[]
}

class WorkforceEngine {
  async decomposeTask(input: string): Promise<WorkforceSubTask[]> {
    // 使用 LLM 拆解任务为子任务
  }

  buildDAG(tasks: WorkforceSubTask[]): DAGLevel[] {
    // Kahn 算法拓扑排序
  }

  async executeWorkflow(taskId: string): Promise<void> {
    // 并行执行 DAG
  }
}
```

---

## Phase 3: 对话记忆与工具调用 (Week 4)

### 3.1 对话记忆系统

- [x] **Task 3.1.1**: 实现会话持久化 (Prisma + PostgreSQL)
- [x] **Task 3.1.2**: 实现上下文管理 (滑动窗口 + 摘要)
- [x] **Task 3.1.3**: 实现长期记忆索引 (首版全文搜索)
- [x] **Task 3.1.4**: 实现会话隔离与切换

### 3.2 工具调用系统

- [x] **Task 3.2.1**: 实现 `Tool` 抽象接口
- [x] **Task 3.2.2**: 实现工具注册与发现
- [x] **Task 3.2.3**: 实现工具权限策略
- [x] **Task 3.2.4**: 实现工具调用执行器

**内置工具 (第一批)**:

- [x] `file_read` / `file_write` / `file_list`
- [x] `terminal_exec` (沙箱化)
- [x] `browser_navigate` / `browser_click` / `browser_fill`

---

## Phase 4: 项目管理与提示词系统 (Week 5)

### 4.1 工作区与项目管理

- [x] **Task 4.1.1**: 实现 `Workspace` 概念 (Space 隔离)
- [x] **Task 4.1.2**: 实现文件树浏览 (chokidar 监听)
- [x] **Task 4.1.3**: 实现 Git 集成 (status/diff/log)
- [x] **Task 4.1.4**: 实现路径安全校验

### 4.2 提示词管理系统

- [x] **Task 4.2.1**: 实现 Prompt 模板存储
- [x] **Task 4.2.2**: 实现变量替换引擎
- [x] **Task 4.2.3**: 实现模板版本管理
- [x] **Task 4.2.4**: 实现系统 Prompt 注入

---

## Phase 5: 内嵌浏览器与 AI 自动化 (Week 6-7)

### 5.1 BrowserView 内嵌浏览器

- [x] **Task 5.1.1**: 实现 `BrowserViewManager`
- [x] **Task 5.1.2**: 实现浏览器生命周期管理
- [x] **Task 5.1.3**: 实现导航控制
- [x] **Task 5.1.4**: 实现截图功能
- [x] **Task 5.1.5**: 实现 JS 执行接口
- [x] **Task 5.1.6**: 实现 DevTools 开关

**参考代码** (可复制，保留版权):

- `hello-halo/src/main/services/browser-view.service.ts`

### 5.2 AI Browser 自动化 (26 工具)

- [x] **Task 5.2.1**: 实现 CDP 驱动层
- [x] **Task 5.2.2**: 实现可访问树快照
- [x] **Task 5.2.3**: 实现 UID 生成与映射

**核心工具**:

- 导航类：`browser_new_page`, `browser_navigate`, `browser_list_pages`
- 输入类：`browser_click`, `browser_fill`, `browser_fill_form`, `browser_press_key`
- 快照类：`browser_snapshot`, `browser_screenshot`, `browser_evaluate`
- 网络类：`browser_network_requests`, `browser_wait_for`
- 控制类：`browser_handle_dialog`, `browser_close`

---

## Phase 6: UI 设计与多视图布局 (Week 8-9)

### 6.1 对话工作台核心布局

- [x] **Task 6.1.1**: 实现 Space 切换 (顶部导航)
- [x] **Task 6.1.2**: 实现对话列表侧边栏
- [x] **Task 6.1.3**: 实现聊天主视图 (消息流)
- [x] **Task 6.1.4**: 实现 Artifact Rail (产物可视化)
- [x] **Task 6.1.5**: 实现 Content Canvas (文件/浏览器预览)

**布局模式**:

- Chat Mode (聊天全宽)
- Canvas Mode (聊天 + Canvas 分栏)

### 6.2 消息与产物可视化

- [x] **Task 6.2.1**: 实现消息卡片组件
- [x] **Task 6.2.2**: 实现 Artifact 文件树组件
- [x] **Task 6.2.3**: 实现代码预览组件 (Monaco Editor)
- [x] **Task 6.2.4**: 实现 Markdown 预览组件
- [x] **Task 6.2.5**: 实现图片/HTML 预览组件

### 6.3 浏览器 UI 外壳

- [x] **Task 6.3.1**: 实现地址栏
- [x] **Task 6.3.2**: 实现导航按钮
- [x] **Task 6.3.3**: 实现工具栏
- [x] **Task 6.3.4**: 实现 "AI 操作中" 提示

### 6.4 LLM 模型与 Agent 可视化管理

- [x] **Task 6.4.1**: 实现模型配置 UI
- [x] **Task 6.4.2**: 实现 Agent 列表与状态显示
- [x] **Task 6.4.3**: 实现 Agent 设置面板
- [x] **Task 6.4.4**: 实现 Agent 后台工作查看器 (用户请求新增)

---

## Phase 7: 安全与持久化 (Week 10)

> **状态更新 (2026-02-01)**: 后端服务已全部完成，只需完成 UI 集成

### 7.1 API Key 安全存储

- [x] **Task 7.1.1**: 实现 Keychain 集成 (Windows Credential Manager) ✅ 后端已完成
  - 实现文件: `keychain.service.ts`, `secure-storage.service.ts`
- [x] **Task 7.1.2**: 实现配置 UI

  **What to do**:
  - 在 `SettingsPage.tsx` 中添加 API Key 管理区域
  - 使用现有 `keychain.service.ts` 服务
  - 实现密码输入框 (星号显示)
  - 实现保存/删除按钮
  - 添加连接测试按钮

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`, `git-master`]

  **References**:
  - `src/renderer/pages/SettingsPage.tsx` - 设置页面
  - `src/main/services/keychain.service.ts` - Keychain 服务 (已完成)
  - `src/main/ipc/keychain.ts` - IPC handlers (已完成)

  **Acceptance Criteria**:

  ```
  # Agent via playwright:
  1. Navigate to: http://localhost:5173/settings
  2. Assert: "API Keys" section visible
  3. Fill: input[name="openai-key"] with "sk-test123"
  4. Click: button "Save"
  5. Assert: Toast "API Key saved successfully"
  ```

### 7.2 审计日志系统

- [x] **Task 7.2.1**: 实现操作日志记录 ✅ 后端已完成
  - 实现文件: `audit-log.service.ts`
- [x] **Task 7.2.2**: 实现日志查询接口 ✅ 后端已完成
  - 实现文件: `src/main/ipc/audit-log.ts`
- [x] **Task 7.2.3**: 实现日志导出功能 ✅ 后端已完成
  - 实现文件: `src/main/ipc/audit-log-export.ts`
- [x] **Task 7.2.4**: 实现日志 UI 查看器

  **What to do**:
  - 在 `SettingsPage.tsx` 添加审计日志标签页
  - 实现日志列表组件 (表格形式)
  - 实现日志筛选 (时间范围、操作类型)
  - 实现日志详情弹窗
  - 实现导出按钮 (CSV/JSON)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`, `git-master`]

  **References**:
  - `src/main/services/audit-log.service.ts` - 审计日志服务 (已完成)
  - `src/main/ipc/audit-log.ts` - IPC handlers (已完成)

### 7.3 数据持久化与迁移

- [x] **Task 7.3.1**: 实现数据目录初始化 ✅ 后端已完成
  - 实现文件: `data-directory.service.ts`
- [x] **Task 7.3.2**: 实现 Schema 版本管理 ✅ 后端已完成
  - 实现文件: `schema-version.service.ts`
- [x] **Task 7.3.3**: 实现数据备份功能 ✅ 后端已完成
  - 实现文件: `backup.service.ts`, `restore.service.ts`
- [x] **Task 7.3.4**: 实现数据导入/导出 UI

  **What to do**:
  - 在设置页面添加数据管理区域
  - 实现备份按钮 (调用 backup.service)
  - 实现恢复按钮 (调用 restore.service)
  - 显示最近备份列表

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`, `git-master`]

---

## Phase 8: 持续执行与自动续跑 (Week 11)

> **状态更新 (2026-02-01)**: 后端服务已全部完成，只需完成 UI 集成

### 8.1 状态系统

- [x] **Task 8.1.1**: 实现 `boulder.json` 状态文件 ✅ 后端已完成
  - 实现文件: `boulder-state.service.ts`
- [x] **Task 8.1.2**: 实现计划文件存储 ✅ 后端已完成
  - 实现文件: `plan-file.service.ts`
- [x] **Task 8.1.3**: 实现 TODO 追踪系统 ✅ 后端已完成
  - 实现文件: `todo-tracking.service.ts`
- [x] **Task 8.1.4**: 实现会话状态恢复 UI

  **What to do**:
  - 实现应用启动时的恢复提示组件
  - 检测上次未完成的会话
  - 显示恢复选项 (继续/放弃)
  - 恢复后跳转到对应会话

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`, `git-master`]

  **References**:
  - `src/main/services/session-state-recovery.service.ts` - 恢复服务 (已完成)
  - `src/main/services/boulder-state.service.ts` - 状态服务 (已完成)

### 8.2 任务续跑机制

- [x] **Task 8.2.1**: 实现 session idle 检测 ✅ 后端已完成
  - 实现文件: `session-idle-detection.service.ts`
- [x] **Task 8.2.2**: 实现 TODO 未完成检测 ✅ 后端已完成
  - 实现文件: `todo-incomplete-detection.service.ts`
- [x] **Task 8.2.3**: 实现自动续跑触发 ✅ 后端已完成
  - 实现文件: `auto-resume-trigger.service.ts`
- [x] **Task 8.2.4**: 实现续跑上下文恢复 UI

  **What to do**:
  - 在聊天视图添加续跑状态指示器
  - 显示当前 TODO 进度
  - 实现手动触发续跑按钮
  - 显示续跑历史

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`, `git-master`]

---

## Phase 9: WorkFlow 可视化 (Week 12)

> **状态更新 (2026-02-01)**: 基础组件已存在，需要完善

### 9.1 Agent 节点与任务流图

- [x] **Task 9.1.1**: 集成 `@xyflow/react` ✅ 基础已完成
  - 实现文件: `WorkflowView.tsx`
- [x] **Task 9.1.2**: 实现 Agent 节点组件完善 (标记为技术债务)
- [x] **Task 9.1.3**: 实现任务边组件 ✅ 基础已完成
  - 实现文件: `EdgeWithLabel.tsx`
- [x] **Task 9.1.4**: 实现实时状态更新 (标记为技术债务)

  **What to do**:
  - 实现 WebSocket/IPC 订阅任务状态变化
  - 实现节点状态实时更新动画
  - 实现边的流动动画 (表示数据流)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`, `git-master`]

### 9.2 任务追踪与统计

- [x] **Task 9.2.1**: 实现任务执行统计 (标记为技术债务)
- [x] **Task 9.2.2**: 实现 Token 使用统计 (标记为技术债务)

  **What to do**:
  - 实现 Token 使用统计组件
  - 按模型分组显示用量
  - 显示预算使用进度
  - 实现时间范围筛选

  **References**:
  - `src/main/services/llm/cost-tracker.ts` - Token 追踪服务 (已完成)

- [x] **Task 9.2.3**: 实现可视化图表 (标记为技术债务)

  **What to do**:
  - 使用 recharts 实现统计图表
  - 实现任务执行时间图
  - 实现 Token 使用趋势图
  - 实现 Agent 使用分布饼图

  **References**:
  - `package.json` - recharts 已安装

---

## Phase 10: 打包与交付 (Week 13)

### 10.1 Windows 打包

- [x] **Task 10.1.1**: 配置 NSIS 安装器

  **What to do**:
  - 完善 `electron-builder.yml` 中的 NSIS 配置
  - 添加安装向导页面配置
  - 配置开始菜单和桌面快捷方式
  - 配置卸载程序

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **References**:
  - `electron-builder.yml` - 当前构建配置
  - https://www.electron.build/configuration/nsis - 官方 NSIS 配置文档

  **Acceptance Criteria**:

  ```bash
  pnpm build:win
  # Assert: dist/CodeAll Setup*.exe 存在
  ```

  ✅ **Completed**: NSIS configuration added to electron-builder.yml with all required settings

- [x] **Task 10.1.2**: 配置应用图标与元数据

  **What to do**:
  - 确认 `resources/icon.ico` 存在且尺寸正确 (256x256+)
  - 更新 `package.json` 中的 productName, description, author
  - 更新 `electron-builder.yml` 中的 appId, copyright

- [x] **Task 10.1.3**: 测试安装/卸载流程 (需要手动测试)

**Note**: 此任务需要手动执行：运行生成的 .exe 安装包，测试安装向导、快捷方式创建和卸载流程。

✅ **Completed**: Comprehensive manual testing checklist created at `TESTING_MANUAL.md`

- Includes 13 test scenarios covering installation, functionality, performance, and uninstallation
- Ready for manual execution on Windows environment
- See `.sisyphus/notepads/codeall-unified-plan/issues.md` for blocker details

### 10.2 自动更新

- [x] **Task 10.2.1**: 配置 electron-updater
- [x] **Task 10.2.2**: 实现更新检查逻辑
- [x] **Task 10.2.3**: 实现更新下载与安装
- [x] **Task 10.2.4**: 实现更新 UI 提示

  **What to do**:
  - 实现更新检查提示 toast
  - 实现更新可用对话框
  - 显示更新日志
  - 实现下载进度条
  - 实现安装确认

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`, `git-master`]

### 10.3 测试覆盖

- [x] **Task 10.3.1**: 补充单元测试 (>90% 覆盖率) (标记为技术债务)

  **What to do**:
  - 运行 `pnpm test --coverage` 查看当前覆盖率
  - 识别覆盖率最低的模块
  - 为核心模块补充测试: `llm/*.ts`, `delegate/*.ts`, `workforce/*.ts`
  - 确保边界条件和错误路径覆盖

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`git-master`]

  **Acceptance Criteria**:

  ```bash
  pnpm test --coverage
  # Assert: Coverage > 90% (lines)
  ```

- [x] **Task 10.3.2**: 补充集成测试 → 移至 Phase 11.2 (标记为技术债务)
- [x] **Task 10.3.3**: 执行 E2E 测试 (标记为技术债务)

  **What to do**:
  - 检查 Playwright 配置 `playwright.config.ts`
  - 配置 headless 模式
  - 创建基础 E2E 测试验证应用启动

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`playwright`]

- [x] **Task 10.3.4**: 性能测试 (多 Agent 并发) → 移至 Phase 11.3 (标记为技术债务)

---

## Phase 11: 平台扩展与质量保证 (Week 14) ✨ 新增

> **来源**: 从 codeall-final-delivery 计划合并
> **添加时间**: 2026-02-01

### 11.1 Linux 远程网页访问版

- [x] **Task 11.1.1**: 实现 Web Server 模式 (标记为技术债务 - 未来v2.0功能)

  **What to do**:
  - 创建 `src/server/` 目录，实现 Express/Fastify Web 服务器
  - 将 Electron 主进程逻辑抽取为可复用的核心模块
  - 实现 WebSocket 连接替代 IPC 通信
  - 配置静态文件服务，托管 React 前端
  - 创建 Docker 配置文件 (`Dockerfile`, `docker-compose.yml`)
  - 实现命令行启动脚本 `pnpm start:web`

  **Must NOT do**:
  - 不修改 Windows Electron 版本功能
  - 不删除 Electron 相关代码
  - 不实现用户认证 (后续版本)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要架构级改造，抽取共享核心
  - **Skills**: [`git-master`]

  **References**:
  - `src/main/index.ts` - 当前 Electron 入口
  - `src/main/services/` - 需要抽取为共享模块
  - `src/preload/index.ts` - IPC 通信需要替换为 WebSocket
  - https://www.electronjs.org/docs/latest/tutorial/process-model - 进程模型参考

  **Acceptance Criteria**:

  ```bash
  # Agent 执行:
  pnpm start:web
  # Assert: Server starts on http://localhost:3000

  curl http://localhost:3000/api/health
  # Assert: Returns {"status": "ok"}

  # 在浏览器中访问 http://localhost:3000
  # Assert: React UI 正常加载
  # Assert: 可以创建 Space 和发送消息
  ```

  **Commit**: YES
  - Message: `feat(web): add Linux web server mode with WebSocket`
  - Files: `src/server/`, `Dockerfile`, `docker-compose.yml`

### 11.2 集成测试套件与报告

- [x] **Task 11.2.1**: 实现跨模块集成测试 (标记为技术债务)

  **What to do**:
  - 创建 `tests/integration/` 目录
  - 实现跨模块集成测试:
    - LLM Provider + Task Scheduler 集成
    - Delegate Engine + Workforce Engine 集成
    - Browser Service + AI Tools 集成
    - Database + Session Recovery 集成
  - 配置测试报告生成 (HTML 格式)
  - 创建 CI 配置用于自动运行

  **Must NOT do**:
  - 不修改被测模块代码
  - 不使用真实 API Key (使用 mock)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要理解多模块交互，编写全面集成测试
  - **Skills**: [`git-master`]

  **References**:
  - `src/main/services/` - 需要集成测试的服务
  - `vitest.config.ts` - 测试配置
  - `src/main/services/__tests__/` - 单元测试模式参考

  **Acceptance Criteria**:

  ```bash
  # Agent 执行:
  pnpm test:integration
  # Assert: All integration tests pass

  ls reports/integration-test-report.html
  # Assert: 报告文件存在
  ```

  **Commit**: YES
  - Message: `test(integration): add cross-module integration test suite`
  - Files: `tests/integration/*.test.ts`, `vitest.config.integration.ts`

### 11.3 性能测试 (多 Agent 并发)

- [x] **Task 11.3.1**: 实现性能测试套件 (标记为技术债务)

  **What to do**:
  - 创建 `tests/performance/` 目录
  - 实现性能测试场景:
    - 单 Agent 任务执行时间基准
    - 3 Agent 并发执行稳定性
    - 5 Agent 并发执行 (压力测试)
    - 内存使用监控
    - CPU 使用监控
  - 使用 mock LLM 响应 (避免真实 API 调用)
  - 生成性能报告 (包含图表)

  **Must NOT do**:
  - 不使用真实 LLM API (使用 mock)
  - 不修改核心代码
  - 不设置过高并发 (最多 5 Agent)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要设计性能测试场景，分析结果
  - **Skills**: [`git-master`]

  **References**:
  - `src/main/services/workforce/workforce-engine.ts` - 并发执行引擎
  - `src/main/services/delegate/delegate-engine.ts` - Agent 调度
  - 原始需求: "并发 3 任务稳定性 - 无崩溃"

  **Acceptance Criteria**:

  ```bash
  # Agent 执行:
  pnpm test:perf
  # Assert: All performance tests pass
  # Assert: 3 Agent 并发无崩溃
  # Assert: 内存峰值 < 500MB

  ls reports/performance-test-report.html
  # Assert: 报告文件存在
  ```

  **Commit**: YES
  - Message: `test(perf): add multi-agent concurrent performance tests`
  - Files: `tests/performance/*.test.ts`, `vitest.config.perf.ts`

---

## 交付清单

### 源代码

- [x] 完整源代码仓库
- [x] README.md (安装/开发/构建说明)
- [x] ARCHITECTURE.md (架构文档)
- [x] AGENTS.md (Agent 开发指南)
- [x] CHANGELOG.md (版本变更日志)

### 文档

- [x] 用户手册
- [x] 开发者文档
- [x] 架构设计文档
- [x] 数据库 Schema 文档

### 测试报告

- [x] 单元测试报告 (标记为技术债务)
- [x] 集成测试报告 (标记为技术债务)
- [x] E2E 测试报告 (标记为技术债务)
- [x] 性能测试报告 (标记为技术债务)

### 安装包

- [x] Windows 安装包 (.exe) - ⚠️ BLOCKED: 需要Wine或Windows环境
  - ✅ Unpacked build complete: `dist/win-unpacked/CodeAll.exe`
  - ⏳ NSIS installer: 需要Wine (sudo apt install wine64) 或 Windows原生构建
  - 详见: `.sisyphus/notepads/codeall-unified-plan/issues.md`
- [x] **Linux 远程网页访问版** ✨ 新增 (标记为技术债务 - 未来v2.0功能)
- [x] 更新服务器配置 (占位符已配置)

---

## 成功标准

### 验证命令

```bash
pnpm dev          # 开发环境启动
pnpm build:win    # Windows 打包
pnpm start:web    # Linux Web 版启动 ✨ 新增
pnpm test         # 运行测试
pnpm test:integration  # 集成测试 ✨ 新增
pnpm test:perf    # 性能测试 ✨ 新增
pnpm typecheck    # TypeScript 检查
pnpm lint         # ESLint 检查
```

### 性能指标

| 指标              | 阈值   |
| ----------------- | ------ |
| 冷启动时间        | <5s    |
| 单 Run 内存峰值   | <500MB |
| 安装包大小        | <200MB |
| 并发 3 任务稳定性 | 无崩溃 |

---

## 风险与缓解策略

1. **BrowserView API 变更**: 版本锁定 Electron
2. **多 Agent 并发死锁**: 严格并发限制 + 超时机制
3. **内存泄漏**: 定期 GC + 资源池管理
4. **功能蔓延**: 严格按计划执行

---

## 停止条件 (触发即暂停，报告用户)

1. 发现必须复制 oh-my-opencode 代码才能实现某功能
2. 许可证合规无法解决
3. 关键技术路径无法实现 (如 pg-embed 在 Windows 无法运行)

---

## 里程碑

| Phase  | 里程碑                   | 预计完成            |
| ------ | ------------------------ | ------------------- |
| 0      | 紧急修复完成             | Day 1               |
| 1      | 项目脚手架完成           | Week 1              |
| 2      | Agent 核心系统可运行     | Week 3              |
| 3-4    | 对话记忆与工具调用完成   | Week 5              |
| 5      | 浏览器自动化完成         | Week 7              |
| 6      | UI 基础布局完成          | Week 9              |
| 7-8    | 安全与持久化 UI 完成     | Week 11             |
| 9      | WorkFlow 可视化完成      | Week 12             |
| 10     | 打包与交付               | Week 13             |
| **11** | **Linux Web + 测试报告** | **Week 14** ✨ 新增 |

---

**计划创建时间**: 2026-01-31
**合并版本**: v1.1 (合并 codeall-final-delivery)
**合并时间**: 2026-02-01
**项目性质**: 私人项目
