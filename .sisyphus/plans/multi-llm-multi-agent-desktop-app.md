# 工作计划：多LLM协同编程与多Agent协同工作桌面应用

**项目名称**：CodeAll
**创建时间**：2026-01-26
**目标**：开发独立运行的 Windows 桌面应用，融合 5 个参考项目的核心优势

---

## 📋 执行总览

**技术栈**：pnpm + Electron + React + TypeScript + Tailwind CSS
**架构模式**：Electron 三段式（Renderer ⇄ Main ⇄ Agent Core）
**开发模式**：实现后补测试
**交付形式**：Windows 安装包 + 自动更新

---

## ✅ 已确认需求

### 核心决策
- [x] **目标平台**：仅 Windows（首发）
- [x] **运行形态**：纯本地桌面应用（无远程服务依赖）
- [x] **LLM 接入**：OpenAI/兼容接口
- [x] **浏览器自动化**：全自动 RPA 级别
- [x] **UI 风格**：对话工作台（类 Slack）+ 多视图并行
- [x] **安全特性**：API Key 安全存储 + 审计日志
- [x] **调度语义**：队列调度 + 失败处理（取消/超时/重试）
- [x] **交付特性**：自动更新机制

### clawdbot 核心能力（必须移植）
- [x] 对话记忆（上下文管理、长期记忆、会话持久化）
- [x] 工具调用（Function calling、工具编排、自定义工具）
- [x] 项目管理（工作区、文件树、版本控制集成）
- [x] 提示词管理（Prompt 模板、变量替换、版本管理）

---

## 🎯 阶段 1：项目初始化与核心架构搭建（Week 1）

### 1.1 项目脚手架创建
- [ ] 使用 `pnpm create electron-vite` 初始化项目
- [ ] 配置 TypeScript（strict mode + path aliases）
- [ ] 配置 ESLint + Prettier（参考 hello-halo 规则）
- [ ] 配置 Tailwind CSS + 主题系统（dark/light）
- [ ] 配置 Vitest（单元测试）+ Playwright（E2E 测试）
- [ ] 配置 electron-builder（Windows 打包）
- [ ] 配置 electron-updater（自动更新）
- [ ] 设置 pnpm workspace（monorepo 结构）

**验收标准**：
- `pnpm dev` 启动开发环境
- `pnpm build` 生成可执行文件
- `pnpm test` 运行测试套件

### 1.2 目录结构设计
```
CodeAll/
├── packages/
│   ├── main/           # Electron 主进程
│   ├── renderer/       # React UI
│   ├── preload/        # Preload 脚本
│   ├── agent-core/     # Agent 核心逻辑（可独立）
│   ├── browser-core/   # 浏览器自动化核心
│   └── shared/         # 共享类型与工具
├── resources/          # 图标、资源文件
├── .sisyphus/          # 状态与计划（借鉴 oh-my-opencode）
└── user-data/          # 本地数据目录（运行时）
```

- [ ] 创建目录结构
- [ ] 配置 path aliases（@main, @renderer, @shared 等）
- [ ] 设置 .gitignore（排除 user-data, dist, .sisyphus/boulder.json）

---

## 🎯 阶段 2：Agent 核心系统移植（Week 2-3）

### 2.1 多 LLM 接入层（参考 oh-my-opencode）
- [ ] 实现 `LLMProvider` 抽象接口
- [ ] 实现 OpenAI Compatible Provider
- [ ] 实现并发限流管理器（ConcurrencyManager）
- [ ] 实现模型配置与切换
- [ ] 实现 Token 计数与预算管理

**参考代码**：
- `oh-my-opencode/src/features/background-agent/manager.ts`
- `oh-my-opencode/src/tools/delegate-task/tools.ts`

**验收标准**：
- 支持配置多个 OpenAI 兼容端点
- 并发限制正常工作（按 model/provider 限流）
- Token 使用量正确统计

### 2.2 任务调度与队列系统（融合 ccg-workflow + eigent）
- [ ] 实现 `TaskQueue`（FIFO 队列）
- [ ] 实现 `TaskScheduler`（调度器）
- [ ] 实现任务超时机制
- [ ] 实现任务取消机制
- [ ] 实现任务重试策略（指数退避）
- [ ] 实现任务依赖管理（简化版 DAG）

**参考代码**：
- `ccg-workflow/codeagent-wrapper`（并行 DAG 执行）
- `eigent/backend/app/utils/workforce.py`（任务队列与依赖）

**验收标准**：
- 任务按 FIFO 顺序执行
- 超时任务正确取消
- 重试机制正常工作
- 依赖任务按序执行

### 2.3 Agent 协同与子代理系统（参考 clawdbot + oh-my-opencode）
- [ ] 实现 `Agent` 基础类
- [ ] 实现 `SubAgent` 并行执行机制（独立 session）
- [ ] 实现 Agent 注册与路由
- [ ] 实现 Agent 生命周期管理（start/pause/resume/stop）
- [ ] 实现 Agent 结果回报机制（announce-back）

**参考代码**：
- `clawdbot/src/agents/tools/sessions-spawn-tool.ts`
- `clawdbot/src/agents/subagent-registry.ts`
- `oh-my-opencode/src/features/background-agent/`

**验收标准**：
- 子代理在独立 session 执行
- 子代理结果正确回报给主对话
- 并发上限正确限制

### 2.4 Hook 生命周期系统（参考 oh-my-opencode）
- [ ] 实现 Hook 事件总线
- [ ] 实现核心 Hook 点（PrePrompt/PreToolUse/PostToolUse/Stop）
- [ ] 实现上下文注入 Hook（AGENTS.md 自动注入）
- [ ] 实现工具输出截断 Hook
- [ ] 实现 TODO 续跑检测 Hook

**参考代码**：
- `oh-my-opencode/src/hooks/`

**验收标准**：
- Hook 按正确顺序触发
- 上下文注入正常工作
- TODO 未完成时自动续跑

---

## 🎯 阶段 3：对话记忆与工具调用（Week 4）

### 3.1 对话记忆系统（参考 clawdbot）
- [ ] 实现会话持久化（SQLite）
- [ ] 实现上下文管理（滑动窗口 + 摘要）
- [ ] 实现长期记忆索引（向量化可选，首版用全文搜索）
- [ ] 实现会话隔离与切换

**参考代码**：
- `clawdbot`（会话持久化到 `~/.clawdbot/`）
- `hello-halo`（Space 工作区隔离）

**数据模型**：
```typescript
interface Session {
  id: string;
  spaceId: string; // 工作区隔离
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: number;
}
```

**验收标准**：
- 对话正确持久化到 SQLite
- 切换 Session 正确加载历史
- 上下文窗口管理正常

### 3.2 工具调用系统（参考 clawdbot）
- [ ] 实现 `Tool` 抽象接口
- [ ] 实现工具注册与发现
- [ ] 实现工具权限策略（allow/deny list）
- [ ] 实现工具调用执行器
- [ ] 实现工具结果格式化

**内置工具（第一批）**：
- [ ] `file_read` / `file_write` / `file_list`
- [ ] `terminal_exec`（沙箱化，限制工作区）
- [ ] `browser_navigate` / `browser_click` / `browser_fill`（浏览器工具，阶段 5 实现）

**参考代码**：
- `clawdbot/src/agents/tools/`
- `clawdbot/src/agents/pi-tools.policy.ts`（工具策略）

**验收标准**：
- Function calling 正常工作
- 工具权限策略正确执行
- 子代理工具受限（禁止敏感工具）

---

## 🎯 阶段 4：项目管理与提示词系统（Week 5）

### 4.1 工作区与项目管理（参考 clawdbot + hello-halo）
- [ ] 实现 `Workspace` 概念（Space 隔离）
- [ ] 实现文件树浏览（chokidar 监听变更）
- [ ] 实现 Git 集成（简单 git status/diff/log）
- [ ] 实现路径安全校验（防止路径穿越）

**参考代码**：
- `hello-halo/src/main/artifact-cache/`（文件树与 watcher）
- `clawdbot`（工作区隔离）

**验收标准**：
- 文件树正确显示
- 文件变更实时更新 UI
- 路径访问限制在工作区内

### 4.2 提示词管理系统（参考 clawdbot）
- [ ] 实现 Prompt 模板存储（文件系统）
- [ ] 实现变量替换引擎（{variable} 语法）
- [ ] 实现模板版本管理
- [ ] 实现系统 Prompt 注入

**参考代码**：
- `clawdbot/skills/*/SKILL.md`
- `ccg-workflow/templates/prompts/`

**数据结构**：
```
user-data/
└── prompts/
    ├── system/
    │   └── default.md
    └── user/
        ├── code-review.md
        └── debug-helper.md
```

**验收标准**：
- Prompt 模板正确加载
- 变量替换正常工作
- 系统 Prompt 自动注入

---

## 🎯 阶段 5：内嵌浏览器与 AI 自动化（Week 6-7）

### 5.1 BrowserView 内嵌浏览器（参考 hello-halo）
- [ ] 实现 `BrowserViewManager`（管理多 BrowserView 实例）
- [ ] 实现浏览器生命周期管理（create/show/hide/destroy）
- [ ] 实现导航控制（url/back/forward/refresh）
- [ ] 实现截图功能
- [ ] 实现 JS 执行接口
- [ ] 实现 DevTools 开关

**参考代码**：
- `hello-halo/src/main/browser/browser-view-manager.ts`
- `hello-halo/src/main/browser/canvas-lifecycle.ts`

**安全配置**：
```typescript
{
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  partition: 'persist:browser'
}
```

**验收标准**：
- BrowserView 正确嵌入窗口
- 导航/截图/JS执行正常工作
- 多实例隔离正常

### 5.2 AI Browser 自动化（26 工具）（参考 hello-halo）
- [ ] 实现 CDP 驱动层（`webContents.debugger`）
- [ ] 实现可访问树快照（`Accessibility.getFullAXTree`）
- [ ] 实现 UID 生成与映射

**核心工具实现**：
- [ ] 导航类：`browser_new_page`, `browser_navigate`, `browser_list_pages`
- [ ] 输入类：`browser_click`, `browser_fill`, `browser_fill_form`, `browser_press_key`, `browser_upload_file`
- [ ] 快照类：`browser_snapshot`, `browser_screenshot`, `browser_evaluate`
- [ ] 网络类：`browser_network_requests`, `browser_wait_for`
- [ ] 控制类：`browser_handle_dialog`, `browser_close`

**参考代码**：
- `hello-halo/src/main/ai-browser/`（完整 26 工具实现）

**验收标准**：
- AI 能通过工具自动浏览网页
- 可访问树快照正确生成
- 表单填写、点击、截图正常工作

### 5.3 AI Browser 集成链路
- [ ] 实现 AI Browser System Prompt 注入
- [ ] 实现工具注册到 Agent 系统
- [ ] 实现权限控制（默认放行 browser 工具）
- [ ] 实现状态同步（AI 操作指示 UI）

**验收标准**：
- Agent 自动调用浏览器工具
- UI 显示"AI 操作中"提示
- 浏览器状态与 UI 同步

---

## 🎯 阶段 6：UI 设计与多视图布局（Week 8-9）

### 6.1 对话工作台核心布局（参考 hello-halo + eigent）
- [ ] 实现 Space 切换（顶部导航）
- [ ] 实现对话列表侧边栏
- [ ] 实现聊天主视图（消息流）
- [ ] 实现 Artifact Rail（产物可视化）
- [ ] 实现 Content Canvas（文件/浏览器预览）

**布局模式**：
- Chat Mode（无 Canvas 时聊天全宽）
- Canvas Mode（聊天 + Canvas 分栏）
- Mobile Mode（Canvas 抽屉化，预留未来）

**参考代码**：
- `hello-halo/src/renderer/components/space/SpacePage.tsx`
- `eigent/ui/src/components/chat/ChatBox.tsx`

**技术选型**：
- 状态管理：Zustand
- UI 组件：Headless UI / Radix UI
- 样式：Tailwind CSS

**验收标准**：
- 三种布局模式正常切换
- 响应式布局正常工作
- 布局偏好正确持久化

### 6.2 消息与产物可视化
- [ ] 实现消息卡片组件（文本/工具调用/思考过程）
- [ ] 实现 Artifact 文件树组件
- [ ] 实现代码预览组件（Monaco Editor）
- [ ] 实现 Markdown 预览组件
- [ ] 实现图片/HTML 预览组件

**参考代码**：
- `hello-halo/src/renderer/components/artifact/`
- `hello-halo/src/renderer/components/canvas/`

**验收标准**：
- 消息正确渲染（文本/代码/工具调用）
- Artifact 实时更新
- 文件预览正常工作

### 6.3 浏览器 UI 外壳
- [ ] 实现地址栏（URL/搜索自动识别）
- [ ] 实现导航按钮（back/forward/refresh/home）
- [ ] 实现工具栏（截图/外部打开/缩放/DevTools）
- [ ] 实现"AI 操作中"提示

**参考代码**：
- `hello-halo/src/renderer/components/browser/BrowserViewer.tsx`

**验收标准**：
- 浏览器控制正常工作
- AI 操作时 UI 正确提示

---

## 🎯 阶段 7：安全与持久化（Week 10）

### 7.1 API Key 安全存储
- [ ] 实现 Keychain 集成（Windows Credential Manager）
- [ ] 实现 API Key 加密存储（fallback）
- [ ] 实现配置 UI（设置页面）

**技术选型**：
- Windows：`keytar` / `node-keytar`
- Fallback：`safeStorage` (Electron)

**验收标准**：
- API Key 安全存储到系统 Keychain
- 重启后正确读取

### 7.2 审计日志系统
- [ ] 实现操作日志记录（所有工具调用）
- [ ] 实现日志查询接口
- [ ] 实现日志导出功能
- [ ] 实现日志 UI 查看器

**日志格式**：
```typescript
interface AuditLog {
  id: string;
  timestamp: number;
  sessionId: string;
  agentId: string;
  action: string; // tool name
  params: any;
  result: any;
  duration: number;
}
```

**存储**：SQLite（`user-data/audit.db`）

**验收标准**：
- 所有工具调用正确记录
- 日志可查询与导出

### 7.3 数据持久化与迁移
- [ ] 实现数据目录初始化
- [ ] 实现数据库 Schema 版本管理
- [ ] 实现数据备份功能
- [ ] 实现数据导入/导出

**数据目录结构**：
```
%APPDATA%/CodeAll/
├── sessions.db      # 会话与消息
├── audit.db         # 审计日志
├── config.json      # 配置
├── workspaces/      # 工作区
└── prompts/         # 提示词模板
```

**验收标准**：
- 数据正确持久化
- Schema 升级正常工作
- 备份/恢复功能正常

---

## 🎯 阶段 8：持续执行与自动续跑（Week 11）

### 8.1 `.sisyphus` 状态系统（参考 oh-my-opencode）
- [ ] 实现 `boulder.json` 状态文件
- [ ] 实现计划文件存储（`.sisyphus/plans/*.md`）
- [ ] 实现 TODO 追踪系统
- [ ] 实现会话状态恢复

**参考代码**：
- `oh-my-opencode/src/features/boulder-state/`

**验收标准**：
- 状态正确持久化
- 中断后正确恢复
- TODO 未完成自动续跑

### 8.2 任务续跑机制
- [ ] 实现 session idle 检测
- [ ] 实现 TODO 未完成检测
- [ ] 实现自动续跑触发
- [ ] 实现续跑上下文恢复

**验收标准**：
- TODO 未完成时自动续跑
- 续跑正确加载上下文

---

## 🎯 阶段 9：WorkFlow 可视化（Week 12）

### 9.1 Agent 节点与任务流图（参考 eigent）
- [ ] 集成 `@xyflow/react`
- [ ] 实现 Agent 节点组件
- [ ] 实现任务边组件
- [ ] 实现实时状态更新

**参考代码**：
- `eigent/ui/src/components/workflow/WorkFlow.tsx`

**验收标准**：
- WorkFlow 图正确渲染
- 节点状态实时更新

### 9.2 任务追踪与统计
- [ ] 实现任务执行统计（成功/失败/耗时）
- [ ] 实现 Token 使用统计
- [ ] 实现可视化图表（Recharts）

**验收标准**：
- 统计数据正确计算
- 图表正确渲染

---

## 🎯 阶段 10：打包与交付（Week 13）

### 10.1 Windows 打包
- [ ] 配置 electron-builder（NSIS 安装器）
- [ ] 配置应用图标与元数据
- [ ] 配置代码签名（可选）
- [ ] 测试安装/卸载流程

**验收标准**：
- 生成可执行安装包
- 安装流程正常
- 卸载正确清理

### 10.2 自动更新
- [ ] 配置 electron-updater
- [ ] 实现更新检查逻辑
- [ ] 实现更新下载与安装
- [ ] 实现更新 UI 提示

**验收标准**：
- 启动时检查更新
- 更新正确下载与安装

### 10.3 测试覆盖
- [ ] 补充单元测试（核心模块 >90% 覆盖率）
- [ ] 补充集成测试（关键路径）
- [ ] 执行 E2E 测试（Playwright）
- [ ] 性能测试（多 Agent 并发）

**测试场景**：
1. 多 LLM 并发调用（10+ 并发）
2. 大文件处理（100MB+）
3. 长时间运行（24h+）
4. 浏览器自动化（复杂表单）

**验收标准**：
- 单元测试覆盖率 >90%
- 所有 E2E 测试通过
- 性能测试达标

---

## 📦 交付清单

### 源代码
- [ ] 完整源代码仓库
- [ ] README.md（安装/开发/构建说明）
- [ ] ARCHITECTURE.md（架构文档）
- [ ] AGENTS.md（Agent 开发指南）
- [ ] CHANGELOG.md（版本变更日志）

### 文档
- [ ] 用户手册（使用指南）
- [ ] 开发者文档（API 文档）
- [ ] 架构设计文档
- [ ] 数据库 Schema 文档

### 测试报告
- [ ] 单元测试报告（覆盖率 + 通过率）
- [ ] 集成测试报告
- [ ] E2E 测试报告
- [ ] 性能测试报告（并发/内存/CPU）

### 安装包
- [ ] Windows 安装包（.exe）
- [ ] 更新服务器配置（或使用 GitHub Releases）

---

## 🚨 风险与缓解策略

### 技术风险
1. **BrowserView API 变更**
   - 缓解：版本锁定 Electron，文档化 API 使用
2. **多 Agent 并发死锁**
   - 缓解：严格并发限制，超时机制，详细日志
3. **内存泄漏（长时间运行）**
   - 缓解：定期 GC，资源池管理，内存监控

### 范围风险
1. **功能蔓延（5 个项目融合）**
   - 缓解：严格按计划执行，每阶段验收，禁止提前实现
2. **参考代码不兼容**
   - 缓解：优先理解原理后重写，避免直接复制粘贴

### 时间风险
1. **13 周可能不足**
   - 缓解：阶段 9（WorkFlow 可视化）已降低优先级，可作为 v1.1 特性延后

---

## 📊 里程碑与时间线

| 阶段 | 里程碑 | 预计完成 |
|-----|--------|---------|
| 1 | 项目脚手架完成 | Week 1 |
| 2 | Agent 核心系统可运行 | Week 3 |
| 3-4 | 对话记忆与工具调用完成 | Week 5 |
| 5 | 浏览器自动化完成 | Week 7 |
| 6 | UI 基础布局完成 | Week 9 |
| 7-8 | 安全与持久化完成 | Week 11 |
| 9 | WorkFlow 可视化完成 | Week 12 |
| 10 | 打包与交付 | Week 13 |

---

## 🎓 技术债务与未来优化

1. **向量数据库**（长期记忆）：首版用全文搜索，后续可升级
2. **本地模型支持**（Ollama）：首版仅 OpenAI 兼容，后续可扩展
3. **macOS/Linux 支持**：首版仅 Windows
4. **多语言 i18n**：首版仅中文/英文
5. **插件系统**：参考 clawdbot plugin-sdk，后续可扩展

---

## ✅ 下一步行动

1. **用户确认计划**：审查本计划，提出修改意见
2. **创建项目仓库**：初始化 Git 仓库
3. **执行阶段 1**：项目脚手架创建

**准备好开始了吗？请确认或提出修改建议。**
