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
> - 可运行的 Windows 安装包 (CodeAll Setup x.x.x.exe)
> - 完整的源代码与文档
> - 单元测试与集成测试报告
> - 性能测试报告
>
> **Estimated Effort**: XL (13 weeks)
> **Parallel Execution**: YES - Multi-wave
> **Critical Path**: Phase 0 (修复) → Phase 1 (脚手架) → Phase 2 (Agent核心) → ... → Phase 10 (打包交付)

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

- [ ] **Task 6.2.1**: 实现消息卡片组件
- [ ] **Task 6.2.2**: 实现 Artifact 文件树组件
- [ ] **Task 6.2.3**: 实现代码预览组件 (Monaco Editor)
- [ ] **Task 6.2.4**: 实现 Markdown 预览组件
- [ ] **Task 6.2.5**: 实现图片/HTML 预览组件

### 6.3 浏览器 UI 外壳

- [ ] **Task 6.3.1**: 实现地址栏
- [ ] **Task 6.3.2**: 实现导航按钮
- [ ] **Task 6.3.3**: 实现工具栏
- [ ] **Task 6.3.4**: 实现 "AI 操作中" 提示

### 6.4 LLM 模型与 Agent 可视化管理

- [ ] **Task 6.4.1**: 实现模型配置 UI
- [ ] **Task 6.4.2**: 实现 Agent 列表与状态显示
- [ ] **Task 6.4.3**: 实现 Agent 设置面板
- [ ] **Task 6.4.4**: 实现 Agent 后台工作查看器 (用户请求新增)

---

## Phase 7: 安全与持久化 (Week 10)

### 7.1 API Key 安全存储

- [ ] **Task 7.1.1**: 实现 Keychain 集成 (Windows Credential Manager)
- [ ] **Task 7.1.2**: 实现配置 UI

### 7.2 审计日志系统

- [ ] **Task 7.2.1**: 实现操作日志记录
- [ ] **Task 7.2.2**: 实现日志查询接口
- [ ] **Task 7.2.3**: 实现日志导出功能
- [ ] **Task 7.2.4**: 实现日志 UI 查看器

### 7.3 数据持久化与迁移

- [ ] **Task 7.3.1**: 实现数据目录初始化
- [ ] **Task 7.3.2**: 实现 Schema 版本管理
- [ ] **Task 7.3.3**: 实现数据备份功能
- [ ] **Task 7.3.4**: 实现数据导入/导出

---

## Phase 8: 持续执行与自动续跑 (Week 11)

### 8.1 状态系统

- [ ] **Task 8.1.1**: 实现 `boulder.json` 状态文件
- [ ] **Task 8.1.2**: 实现计划文件存储
- [ ] **Task 8.1.3**: 实现 TODO 追踪系统
- [ ] **Task 8.1.4**: 实现会话状态恢复

### 8.2 任务续跑机制

- [ ] **Task 8.2.1**: 实现 session idle 检测
- [ ] **Task 8.2.2**: 实现 TODO 未完成检测
- [ ] **Task 8.2.3**: 实现自动续跑触发
- [ ] **Task 8.2.4**: 实现续跑上下文恢复

---

## Phase 9: WorkFlow 可视化 (Week 12)

### 9.1 Agent 节点与任务流图

- [ ] **Task 9.1.1**: 集成 `@xyflow/react`
- [ ] **Task 9.1.2**: 实现 Agent 节点组件
- [ ] **Task 9.1.3**: 实现任务边组件
- [ ] **Task 9.1.4**: 实现实时状态更新

### 9.2 任务追踪与统计

- [ ] **Task 9.2.1**: 实现任务执行统计
- [ ] **Task 9.2.2**: 实现 Token 使用统计
- [ ] **Task 9.2.3**: 实现可视化图表

---

## Phase 10: 打包与交付 (Week 13)

### 10.1 Windows 打包

- [ ] **Task 10.1.1**: 配置 NSIS 安装器
- [ ] **Task 10.1.2**: 配置应用图标与元数据
- [ ] **Task 10.1.3**: 测试安装/卸载流程

### 10.2 自动更新

- [ ] **Task 10.2.1**: 配置 electron-updater
- [ ] **Task 10.2.2**: 实现更新检查逻辑
- [ ] **Task 10.2.3**: 实现更新下载与安装
- [ ] **Task 10.2.4**: 实现更新 UI 提示

### 10.3 测试覆盖

- [ ] **Task 10.3.1**: 补充单元测试 (>90% 覆盖率)
- [ ] **Task 10.3.2**: 补充集成测试
- [ ] **Task 10.3.3**: 执行 E2E 测试
- [ ] **Task 10.3.4**: 性能测试 (多 Agent 并发)

---

## 交付清单

### 源代码

- [ ] 完整源代码仓库
- [ ] README.md (安装/开发/构建说明)
- [ ] ARCHITECTURE.md (架构文档)
- [ ] AGENTS.md (Agent 开发指南)
- [ ] CHANGELOG.md (版本变更日志)

### 文档

- [ ] 用户手册
- [ ] 开发者文档
- [ ] 架构设计文档
- [ ] 数据库 Schema 文档

### 测试报告

- [ ] 单元测试报告
- [ ] 集成测试报告
- [ ] E2E 测试报告
- [ ] 性能测试报告

### 安装包

- [ ] Windows 安装包 (.exe)
- [ ] 更新服务器配置

---

## 成功标准

### 验证命令

```bash
pnpm dev          # 开发环境启动
pnpm build:win    # Windows 打包
pnpm test         # 运行测试
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

| Phase | 里程碑                 | 预计完成 |
| ----- | ---------------------- | -------- |
| 0     | 紧急修复完成           | Day 1    |
| 1     | 项目脚手架完成         | Week 1   |
| 2     | Agent 核心系统可运行   | Week 3   |
| 3-4   | 对话记忆与工具调用完成 | Week 5   |
| 5     | 浏览器自动化完成       | Week 7   |
| 6     | UI 基础布局完成        | Week 9   |
| 7-8   | 安全与持久化完成       | Week 11  |
| 9     | WorkFlow 可视化完成    | Week 12  |
| 10    | 打包与交付             | Week 13  |

---

**计划创建时间**: 2026-01-31
**合并版本**: v1.0
**项目性质**: 私人项目
