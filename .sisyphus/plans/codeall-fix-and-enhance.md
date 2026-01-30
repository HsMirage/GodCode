# CodeAll 修复与增强工作计划

## TL;DR

> **Quick Summary**: 修复 CodeAll EXE 启动无界面问题（嵌入式数据库初始化阻塞），完成代码审核，并优化 UI/UX 界面。
>
> **Deliverables**:
>
> - 可正常显示界面的 Windows EXE
> - 代码质量审核报告
> - 优化后的 UI/UX 界面
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 Waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8

---

## Context

### Original Request

用户报告：编译为 Windows 可执行文件 EXE 后，打开 EXE 文件运行，发现没有界面显示，但是在 Windows 任务管理器中能看到 CodeAll 在运行中。需要：

1. 解决这个问题
2. 检查项目完整程度
3. 审核代码
4. 完善 UI、UX 界面美化

### Interview Summary

**Key Discussions**:

- EXE 能在任务管理器中看到进程，但无窗口界面
- 项目基于 Electron + React + TypeScript + Vite
- 使用 embedded-postgres 作为嵌入式数据库
- 开发模式 (`pnpm dev`) 可能正常工作

**Research Findings**:

- 主进程入口 `src/main/index.ts` 中 `await db.init()` 无 try-catch 包裹
- 如果数据库初始化失败或挂起，`createWindow()` 永远不会被调用
- `electron-builder.yml` 缺少 `asarUnpack` 配置，embedded-postgres 二进制文件可能被错误压缩
- 项目功能模块基本完整：多LLM支持(90%)、多Agent协同(85%)、内嵌浏览器(90%)

### Metis Review

**Identified Gaps** (addressed):

- 数据库初始化无错误处理 → 添加 try-catch 和降级逻辑
- 打包配置缺少二进制解包 → 配置 asarUnpack
- 缺少单实例锁 → 添加 requestSingleInstanceLock
- UI/UX 范围未定义 → 定义 MVP 美化范围

---

## Work Objectives

### Core Objective

修复 EXE 启动无界面问题，确保应用可正常使用；完成代码审核并生成报告；优化核心界面的 UI/UX。

### Concrete Deliverables

- 修复后的主进程代码 (`src/main/index.ts`)
- 更新的数据库服务 (`src/main/services/database.ts`)
- 正确配置的打包文件 (`electron-builder.yml`)
- 代码审核报告 (P0/P1/P2 分级)
- 优化后的 UI 组件

### Definition of Done

- [ ] `pnpm build:win` 编译成功
- [ ] EXE 启动后 5 秒内显示主窗口
- [ ] 即使数据库初始化失败，窗口仍能显示错误提示
- [ ] TypeScript 编译无错误 (`npx tsc --noEmit`)
- [ ] ESLint 检查无错误 (`pnpm lint`)
- [ ] 核心界面视觉一致性提升

### Must Have

- 窗口创建逻辑与数据库初始化解耦
- 完善的错误处理和日志记录
- 正确的二进制文件打包配置
- 单实例锁防止多开

### Must NOT Have (Guardrails)

- ❌ 不重构主进程架构
- ❌ 不修改数据库 schema
- ❌ 不升级主要依赖版本（React/Electron）
- ❌ 不添加新功能
- ❌ 不实现动画效果（除非明确要求）
- ❌ 不添加主题切换系统
- ❌ 不编写测试用例（除非用于验证修复）

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (vitest + playwright)
- **User wants tests**: Manual verification (no new tests)
- **Framework**: vitest (existing)

### Automated Verification

**For EXE 启动验证** (using PowerShell via Bash):

```powershell
# 验证窗口显示
Start-Process ".\dist\win-unpacked\CodeAll.exe"
Start-Sleep -Seconds 5
$process = Get-Process -Name "CodeAll" -ErrorAction SilentlyContinue
if ($process -and $process.MainWindowHandle -ne 0) {
  Write-Output "PASS: Window visible"
  exit 0
} else {
  Write-Output "FAIL: No window"
  exit 1
}
```

**For TypeScript 编译验证** (using Bash):

```bash
npx tsc --noEmit
# Assert: Exit code 0
```

**For ESLint 验证** (using Bash):

```bash
pnpm lint
# Assert: Exit code 0 或仅有 warnings
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately) - Debug 核心修复:
├── Task 1: 修复主进程启动逻辑 (CRITICAL)
├── Task 2: 更新 electron-builder 配置 (CRITICAL)
└── Task 3: 添加单实例锁 (IMPORTANT)

Wave 2 (After Wave 1) - 数据库健壮性:
└── Task 4: 优化数据库初始化 (IMPORTANT)

Wave 3 (After Wave 2) - 验证与审核:
├── Task 5: 编译测试验证 (BLOCKING)
└── Task 6: 代码审核 (PARALLEL)

Wave 4 (After Wave 3) - UI/UX 优化:
├── Task 7: UI 组件优化 (ENHANCEMENT)
└── Task 8: 最终验证 (FINAL)
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| ---- | ---------- | ------ | -------------------- |
| 1    | None       | 4, 5   | 2, 3                 |
| 2    | None       | 5      | 1, 3                 |
| 3    | None       | 5      | 1, 2                 |
| 4    | 1          | 5      | None                 |
| 5    | 1, 2, 3, 4 | 6, 7   | None                 |
| 6    | 5          | 8      | 7                    |
| 7    | 5          | 8      | 6                    |
| 8    | 6, 7       | None   | None                 |

### Agent Dispatch Summary

| Wave | Tasks   | Recommended Agents                                                                                 |
| ---- | ------- | -------------------------------------------------------------------------------------------------- |
| 1    | 1, 2, 3 | delegate_task(category="quick", load_skills=[], run_in_background=true) × 3                        |
| 2    | 4       | delegate_task(category="quick", load_skills=[], run_in_background=false)                           |
| 3    | 5, 6    | delegate_task(category="unspecified-low", ...)                                                     |
| 4    | 7, 8    | delegate_task(category="visual-engineering", load_skills=["frontend-ui-ux", "ui-ux-pro-max"], ...) |

---

## TODOs

> **Task 1 与 Task 3 合并说明**:
> Task 1 和 Task 3 都修改 `src/main/index.ts`，以下是合并后的最终代码结构：
>
> **注意**: 这是结构示意，必须保留现有的所有 import 和清理逻辑（如 `processCleanupService`）。
>
> ```typescript
> import { app, BrowserWindow, dialog } from 'electron'
> import path from 'path'
> import { registerIpcHandlers } from './ipc'
> import { DatabaseService } from './services/database'
> import { processCleanupService } from './services/process-cleanup.service'  // 保留现有 import
> import { logger } from '../shared/logger'
>
> // 顶层异常处理（保持在外部）
> process.on('uncaughtException', error => { ... })
> process.on('unhandledRejection', reason => { ... })
>
> // --- Task 3: 单实例锁 ---
> const gotTheLock = app.requestSingleInstanceLock()
>
> if (!gotTheLock) {
>   app.quit()
> } else {
>   // mainWindow 作为 else 块级变量
>   let mainWindow: BrowserWindow | null = null
>
>   app.on('second-instance', () => {
>     if (mainWindow) {
>       if (mainWindow.isMinimized()) mainWindow.restore()
>       mainWindow.focus()
>     }
>   })
>
>   // --- Task 1: 错误处理逻辑 ---
>   app.whenReady().then(async () => {
>     logger.info('Application starting')
>
>     // 1. 首先创建窗口
>     mainWindow = createWindow()  // 注意：赋值给块级变量
>
>     // 2. 注册 IPC（在 try-catch 外）
>     registerIpcHandlers(mainWindow)
>
>     // 3. 数据库初始化（在 try-catch 内）
>     try {
>       const db = DatabaseService.getInstance()
>       logger.info('Database initialization started')
>       await db.init()
>       logger.info('Database initialization completed')
>     } catch (error) {
>       logger.error('Database initialization failed:', error)
>       dialog.showErrorBox('数据库初始化失败', `...`)
>       // 不抛出，继续运行
>     }
>   })
>
>   // 原有事件处理器（移入 else 块，保留原有逻辑）
>   app.on('window-all-closed', () => {
>     if (process.platform !== 'darwin') {
>       app.quit()
>     }
>   })
>
>   app.on('activate', () => {
>     // 重要：当窗口被重新创建时，更新 mainWindow 引用
>     if (BrowserWindow.getAllWindows().length === 0) {
>       mainWindow = createWindow()  // 更新引用
>     }
>   })
>
>   app.on('will-quit', async _event => {
>     // 保留现有的清理逻辑
>     logger.info('[Main] Resource cleanup started')
>     try { await processCleanupService.cleanupAll() } catch (e) { ... }
>     // ... 其他清理 ...
>   })
>
>   app.on('quit', () => {
>     logger.info('Application quit')
>   })
> }
>
> function createWindow() { ... }  // createWindow 函数保持在外部
> ```
>
> **mainWindow 生命周期关键点**:
>
> 1. `app.whenReady()` 时创建并赋值 `mainWindow = createWindow()`
> 2. `app.on('activate')` 重新创建窗口时也要更新 `mainWindow = createWindow()`
> 3. 窗口关闭时不需要显式设为 null（`second-instance` 会检查 `if (mainWindow)`）
>
> function createWindow() { ... } // createWindow 函数保持在外部
>
> ```
>
> ```

### Phase 1: Debug 核心修复

- [ ] 1. 修复主进程启动逻辑 (CRITICAL)

  **What to do**:
  - 在 `src/main/index.ts` 的 `app.whenReady()` 中，将 `createWindow()` 调用移到 `db.init()` 之前
  - 将 `db.init()` 包裹在 try-catch 中
  - 如果数据库初始化失败，使用 `dialog.showErrorBox()` 显示错误信息给用户
  - 添加详细的启动日志

  **执行顺序明确**:

  ```typescript
  app.whenReady().then(async () => {
    logger.info('Application starting')

    // 1. 首先创建窗口（确保用户能看到界面）
    const mainWindow = createWindow()

    // 2. 注册 IPC 处理器（在 try-catch 外，确保基础通信可用）
    registerIpcHandlers(mainWindow)

    // 3. 尝试初始化数据库（失败时显示错误但不阻塞窗口）
    try {
      const db = DatabaseService.getInstance()
      logger.info('Database initialization started')
      await db.init()
      logger.info('Database initialization completed')
    } catch (error) {
      logger.error('Database initialization failed:', error)
      // 显示错误对话框，但窗口保持打开
      // 注意：dialog 已在文件顶部静态导入，不使用动态导入
      dialog.showErrorBox(
        '数据库初始化失败',
        `CodeAll 无法初始化数据库。部分功能可能不可用。\n\n错误: ${error instanceof Error ? error.message : String(error)}`
      )
      // 不抛出错误，允许应用继续运行（降级模式）
    }
  })
  ```

  > **导入与日志策略统一说明**:
  >
  > - **dialog**: 使用静态导入 `import { dialog } from 'electron'`（在文件顶部）
  > - **logger**: 主进程使用 `logger`（从 `../shared/logger` 导入），与现有代码一致
  > - **不使用动态导入**: `await import('electron')` 方式已删除，统一使用静态导入

  **关键决策**:
  - `registerIpcHandlers()` 在 try-catch **外部**，确保即使数据库失败，IPC 通信仍可用
  - 数据库初始化失败时**不抛出错误**，应用以降级模式继续运行
  - 用户通过 `dialog.showErrorBox()` 获知问题，但仍可看到主窗口

  **与 Task 3 的关系**:

  > **重要**: Task 1 和 Task 3 都修改 `src/main/index.ts`。
  >
  > - Task 1 定义 `app.whenReady()` 内部的错误处理逻辑
  > - Task 3 定义整个文件的单实例锁结构
  > - **最终结构**: Task 1 的代码应嵌入 Task 3 的 `else` 块内
  > - **变量注意**: Task 1 示例中的 `const mainWindow` 应改为 Task 3 定义的块级变量 `mainWindow`

  **Must NOT do**:
  - 不修改数据库初始化逻辑本身
  - 不重构 IPC 注册流程结构

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
    - 这是单文件修复，不需要特殊技能
  - **Skills Evaluated but Omitted**:
    - `playwright`: 不涉及浏览器操作
    - `frontend-ui-ux`: 这是后端修复

  **Parallelization**:
  - **Can Run In Parallel**: NO (与 Task 3 共享同一文件)
  - **Parallel Group**: Wave 1 - 建议与 Task 3 合并执行或按顺序执行
  - **Blocks**: Task 4, Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/main/index.ts:40-49` - 当前 app.whenReady 逻辑，需要重构错误处理
  - `src/main/index.ts:63-89` - will-quit 事件中的资源清理模式，展示了正确的 try-catch 用法

  **API/Type References**:
  - Electron `dialog.showErrorBox()` - 用于显示错误对话框
  - Electron `app.whenReady()` - 应用就绪事件

  **WHY Each Reference Matters**:
  - `index.ts:40-49`: 这是问题的根源，需要理解当前流程
  - `index.ts:63-89`: 展示了项目中已有的错误处理模式，应保持一致

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # 检查代码结构
  grep -n "try.*{" src/main/index.ts | grep -E "db\.init|whenReady"
  # Assert: 应有匹配结果，说明添加了 try-catch

  grep -n "createWindow" src/main/index.ts | head -1
  # Assert: createWindow 应在 db.init 之前调用

  grep -n "dialog\.showErrorBox" src/main/index.ts
  # Assert: 应有错误对话框调用
  ```

  **Evidence to Capture**:
  - [ ] 修改后的代码片段
  - [ ] grep 命令输出

  **Commit**: YES
  - Message: `fix(main): prevent window creation blocking on database init failure`
  - Files: `src/main/index.ts`
  - Pre-commit: `pnpm typecheck`

---

- [ ] 2. 更新 electron-builder 配置 (CRITICAL)

  **What to do**:
  - 在 `electron-builder.yml` 中添加 `asarUnpack` 配置

  > **模式选择决定**: 使用通配符 `@embedded-postgres/**/*` 解包整个 @embedded-postgres 目录。
  > 这会同时解包 windows-x64 和 linux-x64 子目录（如果存在），但只有当前平台的会被实际打包。
  > 这种方式更简洁，且 electron-builder 会自动处理平台差异。
  - 具体添加的配置（**最终版本**）：
    ```yaml
    asarUnpack:
      - '**/node_modules/@embedded-postgres/**/*'
      - '**/node_modules/embedded-postgres/**/*'
      - '**/node_modules/.prisma/client/*.node'
      - '**/*.node'
    ```

  > 注意：不需要精确指定 `windows-x64`，通配符会覆盖所有平台子目录。

  **Must NOT do**:
  - 不修改应用签名配置
  - 不更改输出目录结构

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References** (2025-01-30 shell 验证):

  > **前置条件**: 以下路径验证需要先执行 `pnpm install` 安装依赖。
  > `embedded-postgres` 库会在 postinstall 时根据当前平台自动下载对应二进制包。
  - `electron-builder.yml:1-25` - 当前打包配置，需要添加 asarUnpack

  **验证步骤** (在 `pnpm install` 后执行):

  ```bash
  # 验证 Windows PostgreSQL 二进制
  ls node_modules/@embedded-postgres/windows-x64/native/bin/ | head -5
  # 预期输出: initdb.exe, postgres.exe, pg_ctl.exe 等

  # 验证 Prisma query engine
  ls -la node_modules/.prisma/client/query_engine-windows.dll.node
  # 预期: 约 21MB 的 .node 文件
  ```

  **机制说明**:
  - `package.json` 声明 `embedded-postgres` 和 `@embedded-postgres/linux-x64`
  - `embedded-postgres` 的 postinstall 脚本检测当前平台，在 Windows 上会额外安装 `@embedded-postgres/windows-x64`
  - 因此 `node_modules/@embedded-postgres/windows-x64` 在 Windows 开发环境中存在

  **External References**:
  - electron-builder asarUnpack 文档: https://www.electron.build/configuration/configuration (搜索 "asarUnpack")

    > **asarUnpack 配置说明** (备用文档):
    > `asarUnpack` 是一个字符串数组，指定哪些文件应从 ASAR 压缩包中解压出来。
    > 这对于需要直接执行的二进制文件（如 PostgreSQL）或需要原生路径的 .node 文件至关重要。
    > 语法: 使用 glob 模式匹配，如 `"**/node_modules/@embedded-postgres/**/*"`

  **WHY Each Reference Matters**:
  - `electron-builder.yml`: 理解当前配置结构，确保新配置语法正确
  - `@embedded-postgres/windows-x64/native/`: 包含 `postgres.exe`, `initdb.exe` 等必需的二进制文件，必须解包才能执行
  - `.prisma/client/*.node`: Prisma 使用 native 模块进行数据库查询，必须从 ASAR 解包

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # 检查配置是否包含 asarUnpack
  grep -n "asarUnpack" electron-builder.yml
  # Assert: 应有匹配结果，exit code 0

  # 检查 embedded-postgres 配置
  grep -n "@embedded-postgres" electron-builder.yml
  # Assert: 应有匹配结果

  # 检查 prisma 配置
  grep -n "prisma" electron-builder.yml
  # Assert: 应有匹配结果

  # 验证 YAML 语法 (使用 Node.js 内置 JSON 解析 + 简单格式检查)
  # 注意：项目无 yaml 依赖，使用替代方法验证
  node -e "
    const fs = require('fs');
    const content = fs.readFileSync('electron-builder.yml', 'utf8');
    // 基础语法检查：确保无明显格式错误
    if (!content.includes('asarUnpack:')) throw new Error('Missing asarUnpack');
    if (!content.includes('@embedded-postgres')) throw new Error('Missing @embedded-postgres');
    console.log('YAML basic validation passed');
  "
  # Assert: exit code 0

  # 或者使用 electron-vite build 来间接验证（会解析 electron-builder.yml）
  pnpm build
  # Assert: exit code 0 (编译成功说明配置有效)
  ```

  **Evidence to Capture**:
  - [ ] 修改后的 electron-builder.yml 完整内容
  - [ ] YAML 语法验证通过

  **Commit**: YES
  - Message: `fix(build): add asarUnpack for embedded-postgres and prisma binaries`
  - Files: `electron-builder.yml`
  - Pre-commit: `N/A`

---

- [ ] 3. 添加单实例锁 (IMPORTANT)

  **What to do**:
  - 在 `src/main/index.ts` 中使用 `app.requestSingleInstanceLock()` 防止多实例
  - 如果获取锁失败，立即调用 `app.quit()` 退出
  - 在 `second-instance` 事件中聚焦已有窗口

  **实现策略**:

  > **关键说明**:
  >
  > - `mainWindow` 声明在 `else` 块内（作为块级变量），因为只有获得锁的实例才需要它
  > - **所有现有 `app.on(...)` 事件处理器**（`window-all-closed`, `activate`, `will-quit`, `quit`）都应移入 `else` 块内
  > - 只有 `uncaughtException` 和 `unhandledRejection` 处理器保留在顶层

  ```typescript
  import { app, BrowserWindow } from 'electron'
  // ... 其他 imports ...

  // 顶层：异常处理（保持在外部）
  process.on('uncaughtException', error => { ... })
  process.on('unhandledRejection', reason => { ... })

  // 单实例锁检查
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    // 未获得锁，直接退出
    app.quit()
  } else {
    // 获得锁，正常启动

    // mainWindow 作为 else 块级变量（只有主实例需要）
    let mainWindow: BrowserWindow | null = null

    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }
    })

    // 原有的 app.whenReady()
    app.whenReady().then(async () => {
      mainWindow = createWindow()
      registerIpcHandlers(mainWindow)
      // ... 数据库初始化等 ...
    })

    // 原有的 window-all-closed（移入 else 块）
    app.on('window-all-closed', () => { ... })

    // 原有的 activate（移入 else 块）
    app.on('activate', () => { ... })

    // 原有的 will-quit（移入 else 块）
    app.on('will-quit', async _event => { ... })

    // 原有的 quit（移入 else 块）
    app.on('quit', () => { ... })
  }
  ```

  **关键修改点**:
  1. `mainWindow` 声明在 `else` 块内（作为块级变量，只有获得锁的主实例需要）
  2. 单实例锁逻辑包裹整个应用启动流程
  3. **与 Task 1 的关系**: Task 3 定义了最终的文件结构框架，Task 1 的错误处理逻辑应在此框架内的 `app.whenReady()` 中实现

  **Must NOT do**:
  - 不修改 `createWindow()` 函数内部逻辑
  - 不添加复杂的实例通信（仅聚焦窗口）

  **Task 1 与 Task 3 合并说明**:

  > **重要**: Task 1 和 Task 3 都修改 `src/main/index.ts`。
  >
  > - **Task 3 优先**: Task 3 的单实例锁结构是最终框架
  > - **Task 1 嵌入**: Task 1 的错误处理逻辑在 Task 3 框架的 `app.whenReady()` 内部实现
  > - **建议执行顺序**: 先完成 Task 3 的结构重构，再在其中添加 Task 1 的数据库错误处理
  > - **或者**: 将 Task 1 和 Task 3 合并为单个修改任务

  **Parallelization**:
  - **Can Run In Parallel**: NO (与 Task 1 共享同一文件，需要顺序执行或合并)
  - **Parallel Group**: Wave 1 - Task 1 先执行，然后 Task 3 重构结构；或合并为单任务
  - **Blocks**: Task 5
  - **Blocked By**: None (但建议 Task 1 先完成逻辑，Task 3 再重构结构)

  **References**:

  **Pattern References**:
  - `src/main/index.ts:1-17` - 文件头部，单实例锁应在此处添加

  **External References**:
  - Electron 官方文档: https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelock

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  grep -n "requestSingleInstanceLock" src/main/index.ts
  # Assert: 应有匹配结果

  grep -n "second-instance" src/main/index.ts
  # Assert: 应有 second-instance 事件处理
  ```

  **Commit**: YES
  - Message: `fix(main): add single instance lock to prevent multiple app instances`
  - Files: `src/main/index.ts`
  - Pre-commit: `pnpm typecheck`

---

### Phase 2: 数据库健壮性

- [ ] 4. 优化数据库初始化 (IMPORTANT)

  **What to do**:
  - 在 `src/main/services/database.ts` 的 `init()` 方法中添加初始化超时机制：
    - **超时时间**: 30 秒（embedded-postgres 首次初始化可能需要解压二进制文件）
    - **超时处理策略**:
      1. 超时后抛出标准 `Error`，消息为 `'Database initialization timeout (30s)'`
      2. 错误会被 Task 1 中添加的 try-catch 捕获
      3. 主进程仍会显示窗口，并通过 `dialog.showErrorBox()` 提示用户
      4. **不需要自定义错误类**，使用标准 `Error` 即可
  - 使用 `Promise.race` 实现超时：

    ```typescript
    const INIT_TIMEOUT_MS = 30000; // 30 seconds

    async init(): Promise<void> {
      if (this.isInitialized) { return; }

      const startTime = Date.now();
      console.log('[Database] Starting initialization...');

      const initPromise = this._doInit();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Database initialization timeout (30s)')), INIT_TIMEOUT_MS);
      });

      try {
        await Promise.race([initPromise, timeoutPromise]);
        console.log(`[Database] Initialization complete (${Date.now() - startTime}ms)`);
      } catch (error) {
        console.error('[Database] Initialization failed:', error);
        throw error;
      }
    }

    // 将原有 init() 逻辑移入此方法
    private async _doInit(): Promise<void> {
      // ... 原有代码 ...
    }
    ```

  - 添加日志记录每个初始化阶段：

    > **日志策略决定**: 继续使用 `console.log` 保持与现有代码风格一致。
    > `database.ts` 当前使用 `console.log('[Database]...')`，不引入 logger 以避免额外依赖。
    - `console.log('[Database] Starting initialization...')`
    - `console.log('[Database] Loading credentials...')`
    - `console.log('[Database] Importing embedded-postgres...')`
    - `console.log('[Database] Starting PostgreSQL...')`
    - `console.log('[Database] Connecting Prisma...')`
    - `console.log('[Database] Initialization complete (Xms)')`

  **Must NOT do**:
  - 不修改数据库 schema
  - 不更换数据库类型
  - 不改变现有的路径解析逻辑（`app.getPath('userData')` 已正确处理打包环境）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Wave 1)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References** (已验证存在):

  **Pattern References**:
  - `src/main/services/database.ts:92-141` - 当前 `init()` 方法实现，需要包装超时逻辑
  - `src/main/services/database.ts:75-78` - `dbPath` 使用 `app.getPath('userData')`
    - **实际路径**: 在 Windows 上为 `%APPDATA%\CodeAll\db`（productName 为 CodeAll）
  - `src/main/services/database.ts:98-100` - 现有日志模式 (`console.log('[Database]...')`)，应保持一致风格

  **Code Structure**:
  当前 `init()` 方法结构：

  ```typescript
  async init(): Promise<void> {
    if (this.isInitialized) { return; }
    try {
      // 1. Load credentials (line 102-103)
      // 2. Import EmbeddedPostgres (line 105-106)
      // 3. Create instance (line 108-114)
      // 4. Initialize if needed (line 116-121)
      // 5. Start postgres (line 123)
      // 6. Connect Prisma (line 125-133)
      // 7. Set flag (line 135-136)
    } catch (error) {
      console.error('[Database] Failed to initialize:', error)
      throw error
    }
  }
  ```

  **WHY Each Reference Matters**:
  - `database.ts:92-141`: 需要将整个 try 块包装在 `Promise.race` 中
  - `database.ts:75-78`: 确认路径逻辑无需修改
  - `database.ts:98-100`: 确保新增日志与现有风格一致

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # 检查超时逻辑存在
  grep -n "Promise\.race\|TIMEOUT\|setTimeout.*reject" src/main/services/database.ts
  # Assert: 应有匹配结果 (至少1行)

  # 检查超时时间定义
  grep -n "30000\|30.*second" src/main/services/database.ts
  # Assert: 应有匹配结果

  # 检查日志记录完整性
  grep -c "console\.log\|logger" src/main/services/database.ts
  # Assert: 应 >= 8 (原有约5处 + 新增阶段日志)

  # TypeScript 类型检查
  npx tsc --noEmit src/main/services/database.ts
  # Assert: exit code 0
  ```

  **Evidence to Capture**:
  - [ ] 修改后的 `init()` 方法代码
  - [ ] 超时逻辑验证输出

  **Commit**: YES
  - Message: `fix(database): add 30s initialization timeout and phase logging`
  - Files: `src/main/services/database.ts`
  - Pre-commit: `pnpm typecheck`

---

### Phase 3: 验证与审核

- [ ] 5. 编译测试验证 (BLOCKING)

  **What to do**:
  - 运行 `pnpm build:win` 编译 Windows 版本
  - 测试编译后的 EXE 能否正常显示窗口
  - 验证数据库初始化失败时的错误提示

  **Must NOT do**:
  - 不修改代码（这是验证任务）
  - 不发布版本

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: `["playwright"]`
    - 可能需要进行窗口可见性验证

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (blocking)
  - **Blocks**: Task 6, Task 7
  - **Blocked By**: Task 1, 2, 3, 4

  **References**:

  **Pattern References** (已验证):
  - `package.json:18` - `"build:win": "pnpm run build && electron-builder --win --x64"`

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # 1. 编译
  pnpm build:win
  # Assert: Exit code 0

  # 2. 检查输出文件存在
  test -f dist/win-unpacked/CodeAll.exe && echo "EXE exists" || echo "EXE missing"
  # Assert: 输出 "EXE exists"

  # 3. 检查 asar 解包目录存在
  test -d dist/win-unpacked/resources/app.asar.unpacked && echo "Unpacked exists" || echo "Unpacked missing"
  # Assert: 输出 "Unpacked exists"

  # 4. 验证 embedded-postgres 二进制被解包
  test -d dist/win-unpacked/resources/app.asar.unpacked/node_modules/@embedded-postgres && echo "Postgres unpacked" || echo "Postgres NOT unpacked"
  # Assert: 输出 "Postgres unpacked"

  # 5. TypeScript 检查
  npx tsc --noEmit
  # Assert: Exit code 0
  ```

  **窗口可见性验证** (手动或 PowerShell):

  ```powershell
  # 启动应用并验证窗口
  Start-Process ".\dist\win-unpacked\CodeAll.exe"
  Start-Sleep -Seconds 8

  # 检查进程和窗口句柄
  $process = Get-Process -Name "CodeAll" -ErrorAction SilentlyContinue
  if ($process) {
    Write-Output "Process running: PID $($process.Id)"
    if ($process.MainWindowHandle -ne 0) {
      Write-Output "PASS: Main window is visible"
    } else {
      Write-Output "FAIL: Process running but no visible window"
    }
  } else {
    Write-Output "FAIL: Process not found"
  }

  # 清理
  Stop-Process -Name "CodeAll" -Force -ErrorAction SilentlyContinue
  ```

  **数据库错误提示验证** (模拟数据库初始化失败):

  > **路径说明**: `app.getPath('userData')` 在 Windows 上解析为 `%APPDATA%/{productName}`。
  > 根据 `electron-builder.yml` 中的 `productName: CodeAll`，实际路径为 `%APPDATA%\CodeAll`（注意大小写）。

  ```powershell
  # 临时重命名 postgres 目录使初始化失败
  # 注意: 目录名是 "CodeAll"（与 productName 一致），不是 "codeall"
  $appData = "$env:APPDATA\CodeAll"
  $dbPath = "$appData\db"
  $backupPath = "$appData\db.backup"

  # 备份现有数据库目录（如果存在）
  if (Test-Path $dbPath) {
    Rename-Item $dbPath $backupPath -Force
  }

  # 创建一个无效的 db 目录（阻止正常初始化）
  New-Item -ItemType File -Path $dbPath -Force

  # 启动应用
  Start-Process ".\dist\win-unpacked\CodeAll.exe"
  Start-Sleep -Seconds 10

  # 验证：应该显示窗口（即使有错误对话框）
  $process = Get-Process -Name "CodeAll" -ErrorAction SilentlyContinue
  if ($process -and $process.MainWindowHandle -ne 0) {
    Write-Output "PASS: Window visible despite DB error"
  } else {
    Write-Output "FAIL: No window when DB init fails"
  }

  # 清理
  Stop-Process -Name "CodeAll" -Force -ErrorAction SilentlyContinue
  Remove-Item $dbPath -Force
  if (Test-Path $backupPath) {
    Rename-Item $backupPath $dbPath -Force
  }
  ```

  **Evidence to Capture**:
  - [ ] `pnpm build:win` 输出（成功）
  - [ ] `dist/win-unpacked/` 目录结构截图
  - [ ] 窗口可见性验证结果
  - [ ] 数据库错误时窗口仍显示的截图

  **Commit**: NO (验证任务，无代码更改)

---

- [ ] 6. 代码审核 (PARALLEL)

  **What to do**:
  - 运行 TypeScript 编译检查
  - 运行 ESLint 检查
  - 检查依赖安全漏洞 (`npm audit`)
  - 生成分级问题报告 (P0/P1/P2)

  **Must NOT do**:
  - 不修复发现的问题（仅记录）
  - 不重构代码

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: Task 8
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `package.json:12-13` - typecheck 和 lint 脚本
  - `.eslintrc.json` - ESLint 配置

  **Acceptance Criteria**:

  **报告产物规范**:
  - **输出路径**: `.sisyphus/reports/code-audit-report.md`
  - **报告结构**:

    ```markdown
    # CodeAll 代码审核报告

    生成时间: YYYY-MM-DD HH:MM

    ## 摘要

    - P0 (阻塞性问题): X 项
    - P1 (严重问题): X 项
    - P2 (优化建议): X 项

    ## P0 - 阻塞性问题 (必须修复)

    无 / 列表...

    ## P1 - 严重问题 (建议修复)

    1. [类型] 文件:行号 - 问题描述
       - 证据: 错误消息/代码片段
       - 建议: 修复方案

    ## P2 - 优化建议 (可选)

    1. [类型] 文件:行号 - 问题描述

    ## 依赖安全审计

    - Critical: X
    - High: X
    - Moderate: X

    ## 原始报告附件

    - `.sisyphus/reports/typescript-report.txt`
    - `.sisyphus/reports/eslint-report.txt`
    - `.sisyphus/reports/audit-report.json`
    ```

  **Automated Verification**:

  ```bash
  # 创建报告目录
  mkdir -p .sisyphus/reports

  # TypeScript 检查（输出到报告目录）
  pnpm typecheck 2>&1 | tee .sisyphus/reports/typescript-report.txt
  # 记录输出

  # ESLint 检查（输出到报告目录）
  pnpm lint 2>&1 | tee .sisyphus/reports/eslint-report.txt
  # 记录输出

  # 依赖审计（输出到报告目录）
  # 注意：项目使用 pnpm，使用 pnpm audit 替代 npm audit
  pnpm audit --json > .sisyphus/reports/audit-report.json 2>&1 || true
  # pnpm audit 在发现漏洞时会返回非零退出码，使用 || true 确保脚本继续
  # 记录输出
  ```

  **Evidence to Capture**:
  - [ ] TypeScript 错误数量
  - [ ] ESLint 错误/警告数量
  - [ ] 高危依赖漏洞数量

  **Commit**: NO (审核任务，无代码更改)

---

### Phase 4: UI/UX 优化

- [ ] 7. UI 组件优化 (ENHANCEMENT)

  **What to do**:

  **具体优化目标** (可验证的视觉改进):

  > **修改范围**: 4 个文件 - Sidebar.tsx, ChatPage.tsx, SettingsPage.tsx, MessageList.tsx
  1. **Sidebar 组件** (`src/renderer/src/components/Sidebar.tsx`):
     - 增加 logo 区域的视觉权重（添加渐变背景或图标）
     - 导航项 hover 状态增加平滑过渡 (`transition-all duration-200`)
     - 底部信息卡片与导航项的间距统一
  2. **ChatPage 布局** (`src/renderer/src/pages/ChatPage.tsx`):
     - 优化视图切换按钮的视觉反馈
     - 调整标题区域间距
     - **注意**: 消息气泡样式在 `MessageList.tsx` 中，不在此文件
  3. **MessageList 消息样式** (`src/renderer/src/components/chat/MessageList.tsx`):
     - **当前状态已满足要求**: 用户消息(sky-blue)和助手消息(emerald-green)已有明显区分
     - **当前已有**: `userBubbleClass` 使用 `bg-sky-500/10 text-sky-100`，`assistantBubbleClass` 使用 `bg-emerald-500/10 text-emerald-100`
     - **当前已有**: 两种消息都有阴影 (`shadow-[0_0_22px_...]`)
     - **可选优化**: 如需调整，可微调间距或阴影强度
  4. **SettingsPage 表单** (`src/renderer/src/pages/SettingsPage.tsx`):
     - 表单标签和输入框对齐优化
     - 按钮组视觉层次（主要操作使用 `bg-sky-500` 突出）
     - 规则列表拖拽手柄添加 hover 状态
  5. **一致性优化** (仅限以上 4 个文件):

     > **颜色规范**:
     >
     > - 基础色: `slate-*` 调色板 (背景、文字、边框)
     > - 强调色: `sky-*` (主要操作、用户消息、激活状态)
     > - 辅助强调: `emerald-*` (仅用于助手消息)
     > - **允许组合**: slate + sky 作为标准组合，emerald 仅用于消息区分

     > **圆角规范**:
     >
     > - 主要容器: `rounded-xl` 或 `rounded-2xl`
     > - **豁免**: MessageList.tsx 中的 `rounded-br-md` / `rounded-bl-md` 用于消息气泡角落差异化，这是**有意的设计**，不属于不一致
     > - 其他 3 个文件不应混用 `rounded-lg` 和 `rounded-md`
     - Sidebar/ChatPage/SettingsPage 中确保圆角使用 `rounded-xl` 或 `rounded-2xl`
     - 按钮悬停态统一为 `hover:bg-slate-800/50` 或 `hover:border-slate-500`

  **禁止的改动**:
  - ❌ 不重构组件结构（保持现有 props 和 state）
  - ❌ 不添加主题切换功能
  - ❌ 不实现响应式布局
  - ❌ 不添加复杂动画（仅允许 `transition-*` 类过渡）
  - ❌ 不更改组件文件名或移动文件位置

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `["frontend-ui-ux", "ui-ux-pro-max"]`
    - `frontend-ui-ux`: 理解 UI/UX 最佳实践
    - `ui-ux-pro-max`: Tailwind CSS 专业知识，配色方案建议

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 8)
  - **Blocks**: Task 8
  - **Blocked By**: Task 5

  **References** (已验证存在):

  **Pattern References**:
  - `src/renderer/src/App.tsx:1-23` - 整体布局使用 `bg-slate-950 text-slate-100`
  - `src/renderer/src/components/Sidebar.tsx:26-34` - 当前 logo 区域样式
  - `src/renderer/src/components/Sidebar.tsx:51-79` - 导航项样式模式
  - `src/renderer/src/pages/ChatPage.tsx:116-152` - 视图切换按钮样式（可作为统一参考）
  - `src/renderer/src/pages/SettingsPage.tsx:53-57` - `panelClass` 统一面板样式
  - `src/renderer/src/pages/SettingsPage.tsx:325-364` - 规则列表样式
  - `src/renderer/src/components/chat/MessageList.tsx:24-39` - 消息气泡样式定义
    - `userBubbleClass`: `bg-sky-500/10 text-sky-100` (用户消息)
    - `assistantBubbleClass`: `bg-emerald-500/10 text-emerald-100` (助手消息)

  **Current Style Patterns** (必须保持一致):
  - 面板: `rounded-2xl border border-slate-800/70 bg-slate-950/70 backdrop-blur`
  - 激活按钮: `bg-sky-500/20 text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.2)]`
  - 普通按钮: `text-slate-400 hover:text-slate-300`
  - 输入框: `rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2`

  **WHY Each Reference Matters**:
  - `App.tsx`: 确保全局配色不被破坏
  - `Sidebar.tsx`: 导航组件需要最清晰的视觉层次
  - `ChatPage.tsx`: 核心交互区域，消息区分度影响可读性
  - `SettingsPage.tsx`: `panelClass` 是复用模式，应继续使用

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # 范围限定: 检查 Task 7 涉及的文件
  THREE_FILES="src/renderer/src/components/Sidebar.tsx src/renderer/src/pages/ChatPage.tsx src/renderer/src/pages/SettingsPage.tsx"

  # 1. 检查圆角一致性 - 仅 3 个主要文件（不含 MessageList.tsx，因其有豁免）
  echo "Checking rounded classes in 3 main files (excluding MessageList which has exemption)..."
  grep -oh "rounded-[a-z]*" $THREE_FILES | sort | uniq -c | sort -rn
  # Assert: rounded-xl 和 rounded-2xl 应为主要使用
  # 注意: MessageList.tsx 的 rounded-br-md/rounded-bl-md 是有意设计，不纳入此检查

  # 2. 检查颜色系统 (4 个目标文件)
  ALL_FILES="$THREE_FILES src/renderer/src/components/chat/MessageList.tsx"
  echo "Checking color palette in target files..."
  grep -oh "text-slate-[0-9]*\|bg-slate-[0-9]*\|text-sky-[0-9]*\|bg-sky-[0-9]*\|text-emerald-[0-9]*\|bg-emerald-[0-9]*" $ALL_FILES | sort | uniq -c | sort -rn | head -15
  # Assert: slate 为基础色，sky/emerald 为强调色

  # 3. 检查消息气泡区分 (MessageList.tsx) - 验证现有实现
  echo "Checking message bubble differentiation..."
  grep -c "userBubbleClass\|assistantBubbleClass" src/renderer/src/components/chat/MessageList.tsx
  # Assert: 应 >= 4 (定义 + 使用)

  # 4. 检查过渡效果 (Sidebar 必须有)
  echo "Checking transitions in Sidebar..."
  grep -c "transition" src/renderer/src/components/Sidebar.tsx
  # Assert: 应 >= 5 (导航项应有过渡)

  # 5. TypeScript 检查
  npx tsc --noEmit
  # Assert: exit code 0

  # 6. ESLint 检查
  pnpm lint
  # Assert: exit code 0 或仅 warnings
  ```

  **Visual Verification** (using playwright):

  ```
  1. 启动开发服务器: pnpm dev
  2. 等待服务器就绪
  3. 截图首页: http://localhost:5173/
     - 保存到: .sisyphus/evidence/task-7-home-after.png
  4. 截图设置页: http://localhost:5173/settings
     - 保存到: .sisyphus/evidence/task-7-settings-after.png
  5. 对比修改前后截图（如果有 before 版本）
  ```

  **Specific Checks**:
  - [ ] Sidebar 导航项有 hover 过渡效果
  - [ ] 消息列表用户/助手消息可区分（已验证满足，无需修改）
  - [ ] 设置页按钮有明确的视觉层次
  - [ ] Sidebar/ChatPage/SettingsPage 无混用的圆角类（全为 xl 或 2xl）
  - [ ] MessageList.tsx 的 `rounded-br-md`/`rounded-bl-md` 保留（有意设计）

  **Evidence to Capture**:
  - [ ] 修改前截图（如果有）
  - [ ] 修改后截图
  - [ ] 修改的具体文件和行数清单

  **Commit**: YES
  - Message: `style(ui): enhance visual consistency across Sidebar, ChatPage, and SettingsPage`
  - Files:
    - `src/renderer/src/components/Sidebar.tsx` (必改)
    - `src/renderer/src/pages/ChatPage.tsx` (必改)
    - `src/renderer/src/pages/SettingsPage.tsx` (必改)
    - `src/renderer/src/components/chat/MessageList.tsx` (可选，仅验证，当前状态已满足要求)
  - Pre-commit: `pnpm typecheck && pnpm lint`
  - **注意**: MessageList.tsx 纳入范围主要用于验证，若不需要修改则不包含在 commit 中

---

- [ ] 8. 最终验证 (FINAL)

  **What to do**:
  - 重新编译 Windows 版本
  - 完整测试所有修复和优化
  - 生成最终报告

  **Must NOT do**:
  - 不添加新功能
  - 不进行额外优化

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: `["playwright"]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Final (after all tasks)
  - **Blocks**: None
  - **Blocked By**: Task 6, Task 7

  **References**:

  **最终验证文件清单** (需核验的具体变更点):
  - `src/main/index.ts` - Task 1 & 3: 错误处理 + 单实例锁
  - `src/main/services/database.ts` - Task 4: 超时机制 + 阶段日志
  - `electron-builder.yml` - Task 2: asarUnpack 配置
  - `src/renderer/src/components/Sidebar.tsx` - Task 7: UI 优化
  - `src/renderer/src/pages/ChatPage.tsx` - Task 7: UI 优化
  - `src/renderer/src/pages/SettingsPage.tsx` - Task 7: UI 优化
  - `src/renderer/src/components/chat/MessageList.tsx` - Task 7: 验证（可能无修改）
  - `.sisyphus/reports/code-audit-report.md` - Task 6: 代码审核报告

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # 重新编译
  pnpm build:win
  # Assert: Exit code 0

  # TypeScript 检查
  npx tsc --noEmit
  # Assert: Exit code 0

  # ESLint 检查
  pnpm lint
  # Assert: Exit code 0 或仅有 warnings
  ```

  **单实例锁验证** (PowerShell):

  > 复用 Task 5 的验证脚本模式

  ```powershell
  # 启动第一个实例
  Start-Process ".\dist\win-unpacked\CodeAll.exe"
  Start-Sleep -Seconds 5

  # 尝试启动第二个实例
  Start-Process ".\dist\win-unpacked\CodeAll.exe"
  Start-Sleep -Seconds 3

  # 检查进程数量
  $processes = Get-Process -Name "CodeAll" -ErrorAction SilentlyContinue
  $count = ($processes | Measure-Object).Count

  if ($count -eq 1) {
    Write-Output "PASS: 单实例锁生效，只有一个进程运行"
  } else {
    Write-Output "FAIL: 检测到 $count 个进程，单实例锁未生效"
  }

  # 清理
  Stop-Process -Name "CodeAll" -Force -ErrorAction SilentlyContinue
  ```

  **数据库失败时窗口仍显示验证** (PowerShell):

  > 复用 Task 5 的数据库错误提示验证脚本

  ```powershell
  # 临时使数据库初始化失败
  $appData = "$env:APPDATA\CodeAll"
  $dbPath = "$appData\db"
  $backupPath = "$appData\db.backup"

  # 备份现有数据库目录
  if (Test-Path $dbPath) {
    Rename-Item $dbPath $backupPath -Force
  }

  # 创建无效的 db 目录（阻止正常初始化）
  New-Item -ItemType File -Path $dbPath -Force

  # 启动应用
  Start-Process ".\dist\win-unpacked\CodeAll.exe"
  Start-Sleep -Seconds 10

  # 验证：窗口应该显示（即使有错误对话框）
  $process = Get-Process -Name "CodeAll" -ErrorAction SilentlyContinue
  if ($process -and $process.MainWindowHandle -ne 0) {
    Write-Output "PASS: 数据库初始化失败时窗口仍可见"
  } else {
    Write-Output "FAIL: 数据库初始化失败时无窗口显示"
  }

  # 清理
  Stop-Process -Name "CodeAll" -Force -ErrorAction SilentlyContinue
  Remove-Item $dbPath -Force
  if (Test-Path $backupPath) {
    Rename-Item $backupPath $dbPath -Force
  }
  ```

  **Evidence to Capture**:
  - [ ] 最终编译成功的输出
  - [ ] EXE 启动截图

  **Commit**: NO (验证任务)

---

## Commit Strategy

| After Task | Message                                                                 | Files                         | Verification                |
| ---------- | ----------------------------------------------------------------------- | ----------------------------- | --------------------------- |
| 1          | `fix(main): prevent window creation blocking on database init failure`  | src/main/index.ts             | pnpm typecheck              |
| 2          | `fix(build): add asarUnpack for embedded-postgres binaries`             | electron-builder.yml          | N/A                         |
| 3          | `fix(main): add single instance lock to prevent multiple app instances` | src/main/index.ts             | pnpm typecheck              |
| 4          | `fix(database): add initialization timeout and improved error logging`  | src/main/services/database.ts | pnpm typecheck              |
| 7          | `style(ui): enhance visual consistency and user experience`             | src/renderer/src/\*_/_.tsx    | pnpm typecheck && pnpm lint |

---

## Success Criteria

### Verification Commands

```bash
# 1. 编译成功
pnpm build:win
# Expected: Exit code 0, 生成 dist/win-unpacked/CodeAll.exe

# 2. TypeScript 无错误
npx tsc --noEmit
# Expected: Exit code 0

# 3. ESLint 通过
pnpm lint
# Expected: Exit code 0 或仅 warnings

# 4. EXE 启动测试 (PowerShell)
Start-Process ".\dist\win-unpacked\CodeAll.exe"
Start-Sleep -Seconds 5
$p = Get-Process -Name "CodeAll" -ErrorAction SilentlyContinue
if ($p.MainWindowHandle -ne 0) { "PASS" } else { "FAIL" }
# Expected: PASS
```

### Final Checklist

- [ ] EXE 启动后 5 秒内显示主窗口
- [ ] 数据库初始化失败时显示友好错误提示
- [ ] 多次点击 EXE 不会启动多个实例
- [ ] 所有 TypeScript 错误已修复
- [ ] ESLint 检查通过
- [ ] UI 界面视觉一致性提升
- [ ] 代码审核报告已生成

---

## Risk Mitigation

### Backup Before Changes

```bash
# 在开始修改前创建备份
git stash
git checkout -b backup/before-fix-$(date +%Y%m%d)
git checkout main
```

### Rollback Plan

如果修复失败，可以回滚到之前的状态：

```bash
git checkout backup/before-fix-YYYYMMDD
```

### Known Limitations

- 此计划不包括 CI/CD 配置
- 不包括自动化测试用例编写
- 不包括其他平台（macOS/Linux）的打包修复
