# CodeAll 四大功能模块实施计划

**创建日期:** 2026-02-05
**状态:** 待实施
**优先级顺序:** 模块4 → 模块1 → 模块2 → 模块3

---

## 项目现状

### 已完成的核心能力

- ✅ Electron + React + TypeScript 基础架构
- ✅ 多 LLM 适配层（OpenAI 兼容）
- ✅ SmartRouter 智能路由 + 正则匹配规则
- ✅ DelegateEngine 任务委派 + WorkforceEngine 工作流
- ✅ 预置 Agent（oracle/explore/librarian）及 Category 配置
- ✅ 数据库模型（Prisma + 嵌入式 PostgreSQL）
- ✅ 设置页面（LLM配置、API密钥、路由规则管理）
- ✅ 前端多面板布局框架（react-resizable-panels）
- ✅ AI 浏览器基础服务（基于 Electron BrowserView，26个工具已定义）

---

## Agent 与 Category 命名体系

### 主要 Agent（9个）

| 代码名 | 中文名 | 显示格式 | 类型 | 职责 |
|--------|--------|----------|------|------|
| `fuxi` | 伏羲 | 伏羲(FuXi) | primary | 战略规划器，面试模式创建工作计划 |
| `haotian` | 昊天 | 昊天(HaoTian) | primary | 主编排器，任务分解、并行委派 |
| `kuafu` | 夸父 | 夸父(KuaFu) | primary | 工作计划执行器，任务分发与进度跟踪 |
| `luban` | 鲁班 | 鲁班(LuBan) | primary | 自主深度工作者，深入研究后果断行动 |
| `baize` | 白泽 | 白泽(BaiZe) | subagent | 架构决策、代码审查、调试专家（只读咨询） |
| `chongming` | 重明 | 重明(ChongMing) | subagent | 预规划分析，识别隐藏意图和歧义 |
| `leigong` | 雷公 | 雷公(LeiGong) | subagent | 计划审查，验证清晰度和完整性 |
| `diting` | 谛听 | 谛听(DiTing) | subagent | 文档查找、开源实现、多仓库分析 |
| `qianliyan` | 千里眼 | 千里眼(QianLiYan) | subagent | 快速代码库探索、上下文搜索 |

### Category（8个）

| 代码名 | 中文名 | 显示格式 | 用途 |
|--------|--------|----------|------|
| `zhinu` | 织女 | 织女(ZhiNv) | 前端/UI/UX、设计、样式、动画 |
| `cangjie` | 仓颉 | 仓颉(CangJie) | 文档、技术写作 |
| `tianbing` | 天兵 | 天兵(TianBing) | 琐碎任务，单文件修改 |
| `guigu` | 鬼谷 | 鬼谷(GuiGu) | 复杂推理任务 |
| `maliang` | 马良 | 马良(MaLiang) | 创意任务 |
| `guixu` | 归墟 | 归墟(GuiXu) | 深度任务 |
| `tudi` | 土地 | 土地(TuDi) | 通用低复杂度任务 |
| `dayu` | 大禹 | 大禹(DaYu) | 通用高复杂度任务 |

---

## 模块4：LLM 模型与 Agent 绑定功能

### 目标

实现可视化管理界面，让用户能够为每个 Agent 和 Category 绑定特定的 LLM 模型。

### 数据库变更

```prisma
// 新增：Agent 绑定配置表
model AgentBinding {
  id           String   @id @default(cuid())
  agentCode    String   @unique  // "fuxi" | "haotian" | "kuafu" | ...
  agentName    String             // "伏羲(FuXi)"
  agentType    String             // "primary" | "subagent"
  description  String?            // 职责描述
  modelId      String?            // 关联到 Model 表
  model        Model?   @relation(fields: [modelId], references: [id])
  temperature  Float    @default(0.5)
  tools        String[] // 可用工具列表 ["grep", "read", "glob", ...]
  systemPrompt String?  @db.Text  // 可选的系统提示词覆盖
  enabled      Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

// 新增：Category 绑定配置表
model CategoryBinding {
  id            String   @id @default(cuid())
  categoryCode  String   @unique  // "zhinu" | "cangjie" | "tianbing" | ...
  categoryName  String             // "织女(ZhiNv)"
  description   String?            // 用途描述
  modelId       String?
  model         Model?   @relation(fields: [modelId], references: [id])
  temperature   Float    @default(0.5)
  enabled       Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// Model 表新增上下文字段
model Model {
  // ... 现有字段
  contextSize  Int      @default(32)  // 单位：K，存储 32 表示 32K
}
```

### IPC 接口

```typescript
// src/shared/ipc-channels.ts 新增
export const INVOKE_CHANNELS = {
  // Agent 绑定管理
  'agent-binding:list': 'agent-binding:list',
  'agent-binding:get': 'agent-binding:get',
  'agent-binding:update': 'agent-binding:update',
  'agent-binding:reset': 'agent-binding:reset',

  // Category 绑定管理
  'category-binding:list': 'category-binding:list',
  'category-binding:get': 'category-binding:get',
  'category-binding:update': 'category-binding:update',
  'category-binding:reset': 'category-binding:reset',
}
```

### 前端 UI

**设置页面新增 Tab：**

```typescript
const TABS = [
  { id: 'llm', label: 'LLM配置' },
  { id: 'agents', label: '智能体' },  // 新增
  { id: 'keys', label: 'API密钥' },
  { id: 'rules', label: '路由规则' },
  { id: 'data', label: '数据管理' }
]
```

**智能体绑定页面：**

- 子 Tab：[主要智能体] [辅助智能体] [任务类别]
- Agent 卡片：显示名称、描述、绑定模型下拉、温度滑块、编辑提示词按钮

**LLM 配置页面新增上下文字段：**

```
上下文: [128] K
```

### 组件清单

| 组件 | 文件路径 | 职责 |
|------|----------|------|
| AgentBindingPage | `src/renderer/src/pages/AgentBindingPage.tsx` | 智能体绑定主页面 |
| AgentCard | `src/renderer/src/components/settings/AgentCard.tsx` | 单个 Agent 卡片 |
| CategoryCard | `src/renderer/src/components/settings/CategoryCard.tsx` | 单个 Category 卡片 |
| ModelSelector | `src/renderer/src/components/settings/ModelSelector.tsx` | 模型下拉选择器 |
| PromptEditor | `src/renderer/src/components/settings/PromptEditor.tsx` | 系统提示词编辑弹窗 |

### 实施步骤

1. 更新 Prisma Schema，运行迁移
2. 创建 AgentBinding 和 CategoryBinding 的 CRUD 服务
3. 注册 IPC Handler
4. 实现默认配置初始化逻辑
5. 开发前端组件
6. 修改 DelegateEngine 读取绑定配置

---

## 模块1：多视图并行工作台布局

### 目标

实现灵活的多面板工作台，支持同时查看对话、后台任务、浏览器。

### 布局结构

```
┌────────┬────────────────────────────┬─────────────────────┬──────────────────────────┐
│ 会话   │       主对话界面            │    后台任务/产物     │      浏览器预览          │
│ 列表   │                            │    (手动点开)        │      (自动展开)          │
│        │                            │                     │                          │
│ (固定) │        (固定显示)           │     (可展开)         │      (需要时自动)        │
└────────┴────────────────────────────┴─────────────────────┴──────────────────────────┘
```

### 面板状态

| 面板 | 默认状态 | 触发展开 | 位置 |
|------|----------|----------|------|
| 会话列表 | 固定显示 | - | 最左侧 |
| 主对话界面 | 固定显示 | - | 中间 |
| 后台任务/产物 | 隐藏 | 点击"后台任务"按钮 | 对话右侧 |
| 浏览器预览 | 隐藏 | Agent 调用浏览器工具时自动 | 最右侧 |

### 组件清单

| 组件 | 文件路径 | 职责 |
|------|----------|------|
| WorkbenchLayout | `src/renderer/src/layouts/WorkbenchLayout.tsx` | 工作台主布局 |
| SessionSidebar | `src/renderer/src/components/sidebar/SessionSidebar.tsx` | 会话/项目列表 |
| ChatPanel | `src/renderer/src/components/panels/ChatPanel.tsx` | 主对话面板 |
| TaskPanel | `src/renderer/src/components/panels/TaskPanel.tsx` | 后台任务面板 |
| ArtifactPanel | `src/renderer/src/components/panels/ArtifactPanel.tsx` | 产物面板 |
| BrowserPanel | `src/renderer/src/components/panels/BrowserPanel.tsx` | 浏览器预览面板 |
| PanelSplitter | `src/renderer/src/components/panels/PanelSplitter.tsx` | 面板分割器 |

### 状态管理

```typescript
// src/renderer/src/store/ui.store.ts 扩展
interface UIState {
  // 面板显示状态
  isTaskPanelOpen: boolean
  isBrowserPanelOpen: boolean

  // 面板宽度
  taskPanelWidth: number
  browserPanelWidth: number

  // 操作
  openTaskPanel: () => void
  closeTaskPanel: () => void
  openBrowserPanel: () => void
  closeBrowserPanel: () => void
}
```

### 实施步骤

1. 创建 WorkbenchLayout 组件
2. 重构 MainLayout 使用新布局
3. 实现面板展开/收起动画
4. 添加 IPC 事件监听（浏览器自动展开）
5. 实现面板宽度拖拽调整
6. 持久化面板状态到 localStorage

---

## 模块2：Agent 产物可视化与追踪

### 目标

实现 Agent 执行过程的实时追踪、任务 DAG 可视化、产物管理。

### 数据库变更

```prisma
// 新增：Agent 执行记录
model AgentRun {
  id          String   @id @default(cuid())
  taskId      String
  task        Task     @relation(fields: [taskId], references: [id])
  agentCode   String   // "qianliyan" | "diting" | ...
  status      String   // "running" | "completed" | "failed"
  logs        Json     // 执行日志数组
  startedAt   DateTime @default(now())
  completedAt DateTime?
}

// 新增：产物记录
model Artifact {
  id          String   @id @default(cuid())
  sessionId   String
  session     Session  @relation(fields: [sessionId], references: [id])
  filePath    String   // 文件路径
  changeType  String   // "created" | "modified" | "deleted"
  diff        String?  @db.Text  // diff 内容
  accepted    Boolean  @default(false)
  createdAt   DateTime @default(now())
}
```

### 任务追踪 UI

- 任务链 DAG 可视化（使用 ReactFlow）
- 节点状态：✓ 完成 / ● 运行中 / ○ 等待 / ✗ 失败
- 点击节点展开详细日志

### 产物面板 UI

- Tab 切换：[任务] [产物]
- 产物列表：文件路径、变更类型、行数统计
- 操作按钮：查看 Diff、接受、撤销
- Diff 弹窗：代码对比视图

### 组件清单

| 组件 | 文件路径 | 职责 |
|------|----------|------|
| TaskTracker | `src/renderer/src/components/task/TaskTracker.tsx` | 任务链可视化 |
| TaskNode | `src/renderer/src/components/task/TaskNode.tsx` | DAG 节点 |
| AgentLogViewer | `src/renderer/src/components/task/AgentLogViewer.tsx` | Agent 日志查看 |
| ArtifactList | `src/renderer/src/components/artifact/ArtifactList.tsx` | 产物列表 |
| ArtifactCard | `src/renderer/src/components/artifact/ArtifactCard.tsx` | 产物卡片 |
| DiffViewer | `src/renderer/src/components/artifact/DiffViewer.tsx` | Diff 弹窗 |

### IPC 接口

```typescript
export const INVOKE_CHANNELS = {
  'agent-run:list': 'agent-run:list',
  'agent-run:get-logs': 'agent-run:get-logs',
  'artifact:list': 'artifact:list',
  'artifact:get-diff': 'artifact:get-diff',
  'artifact:accept': 'artifact:accept',
  'artifact:revert': 'artifact:revert',
}

export const EVENT_CHANNELS = {
  'agent-run:update': 'agent-run:update',  // 实时推送运行状态
  'artifact:created': 'artifact:created',  // 新产物通知
}
```

### 实施步骤

1. 更新 Prisma Schema，运行迁移
2. 创建 AgentRun 和 Artifact 的服务
3. 在工具执行器中记录日志和产物
4. 实现 IPC Handler 和事件推送
5. 开发前端组件
6. 集成 diff 库（diff2html 或 react-diff-viewer）

---

## 模块3：内嵌浏览器与 AI 自动操控

### 目标

完善 ai-browser 服务，实现 Agent 可视化操控浏览器。

### 现状

- BrowserViewManager 已实现（基于 Electron BrowserView）
- 26 个浏览器工具已定义
- 工具适配器已就绪

### 待完善

1. 前端浏览器面板 UI
2. Agent 操作可视化反馈
3. 操作日志推送

### 浏览器面板 UI

- 地址栏 + 导航按钮（后退、前进、刷新）
- 标签页管理
- 网页内容区（BrowserView 嵌入）
- Agent 操作日志区

### 操作可视化反馈

| 操作 | 视觉反馈 |
|------|----------|
| click | 红色圆圈脉冲动画 |
| fill | 输入框高亮 + 打字动画 |
| hover | 元素边框高亮 |
| screenshot | 屏幕闪烁效果 |
| scroll | 滚动指示箭头 |

### IPC 接口

```typescript
export const INVOKE_CHANNELS = {
  'browser:navigate': 'browser:navigate',
  'browser:snapshot': 'browser:snapshot',
  'browser:screenshot': 'browser:screenshot',
  'browser:click': 'browser:click',
  'browser:fill': 'browser:fill',
  'browser:list-tabs': 'browser:list-tabs',
  'browser:new-tab': 'browser:new-tab',
  'browser:close-tab': 'browser:close-tab',
  'browser:select-tab': 'browser:select-tab',
}

export const EVENT_CHANNELS = {
  'browser:operation-log': 'browser:operation-log',
  'browser:show': 'browser:show',
  'browser:hide': 'browser:hide',
}
```

### 自动展开逻辑

```typescript
const BROWSER_TOOLS = [
  'browser_navigate', 'browser_click', 'browser_fill',
  'browser_snapshot', 'browser_screenshot', ...
]

// 工具执行前检查
if (BROWSER_TOOLS.includes(toolName)) {
  mainWindow.webContents.send('browser:show')
}
```

### 组件清单

| 组件 | 文件路径 | 职责 |
|------|----------|------|
| BrowserPanel | `src/renderer/src/components/panels/BrowserPanel.tsx` | 浏览器面板容器 |
| BrowserToolbar | `src/renderer/src/components/browser/BrowserToolbar.tsx` | 地址栏和导航 |
| BrowserTabs | `src/renderer/src/components/browser/BrowserTabs.tsx` | 标签页管理 |
| BrowserView | `src/renderer/src/components/browser/BrowserView.tsx` | 网页内容区 |
| OperationLog | `src/renderer/src/components/browser/OperationLog.tsx` | 操作日志 |

### 实施步骤

1. 创建 BrowserPanel 组件框架
2. 实现标签页管理 UI
3. 集成 BrowserView 嵌入
4. 实现操作日志推送和显示
5. 添加可视化反馈注入脚本
6. 实现自动展开逻辑

---

## 实施时间线

| 阶段 | 模块 | 主要任务 |
|------|------|----------|
| 阶段1 | 模块4 | 数据库迁移 + Agent/Category 绑定服务 + 前端 UI |
| 阶段2 | 模块1 | 工作台布局重构 + 面板系统 |
| 阶段3 | 模块2 | 任务追踪 + 产物管理 |
| 阶段4 | 模块3 | 浏览器面板 + 操作可视化 |

---

## 文件变更清单

### 新增文件

```
src/
├── main/
│   ├── services/
│   │   ├── agent-binding.service.ts
│   │   └── category-binding.service.ts
│   └── ipc/handlers/
│       ├── agent-binding.handler.ts
│       └── category-binding.handler.ts
├── renderer/src/
│   ├── layouts/
│   │   └── WorkbenchLayout.tsx
│   ├── pages/
│   │   └── AgentBindingPage.tsx
│   └── components/
│       ├── settings/
│       │   ├── AgentCard.tsx
│       │   ├── CategoryCard.tsx
│       │   ├── ModelSelector.tsx
│       │   └── PromptEditor.tsx
│       ├── panels/
│       │   ├── TaskPanel.tsx
│       │   ├── ArtifactPanel.tsx
│       │   ├── BrowserPanel.tsx
│       │   └── PanelSplitter.tsx
│       ├── task/
│       │   ├── TaskTracker.tsx
│       │   ├── TaskNode.tsx
│       │   └── AgentLogViewer.tsx
│       ├── artifact/
│       │   ├── ArtifactList.tsx
│       │   ├── ArtifactCard.tsx
│       │   └── DiffViewer.tsx
│       └── browser/
│           ├── BrowserToolbar.tsx
│           ├── BrowserTabs.tsx
│           ├── BrowserView.tsx
│           └── OperationLog.tsx
└── shared/
    └── agent-definitions.ts  # Agent 和 Category 定义常量
```

### 修改文件

```
prisma/schema.prisma          # 新增 AgentBinding, CategoryBinding, AgentRun, Artifact
src/shared/ipc-channels.ts    # 新增 IPC 通道
src/renderer/src/store/ui.store.ts  # 扩展面板状态
src/renderer/src/pages/SettingsPage.tsx  # 新增智能体 Tab
src/main/services/delegate/delegate-engine.ts  # 读取绑定配置
src/main/services/tools/tool-execution.service.ts  # 记录产物和日志
```

---

## 验收标准

### 模块4 ✅ 已完成

- [x] 可在设置页面查看所有 Agent 和 Category
- [x] 可为每个 Agent/Category 绑定不同的 LLM 模型
- [x] 可调整温度参数
- [ ] 可编辑系统提示词
- [x] 绑定配置在 Agent 调用时生效

### 模块1 ✅ 已完成

- [x] 默认显示对话界面
- [x] 点击按钮可展开后台任务面板
- [x] Agent 调用浏览器工具时自动展开浏览器面板
- [x] 面板宽度可拖拽调整
- [x] 面板状态持久化

### 模块2

- [ ] 可查看当前会话的任务链
- [ ] 任务状态实时更新
- [ ] 可查看 Agent 执行日志
- [ ] 可查看产物列表和 Diff
- [ ] 可接受或撤销产物变更

### 模块3

- [ ] 浏览器面板可正常显示网页
- [ ] 支持多标签页管理
- [ ] Agent 操作有可视化反馈
- [ ] 操作日志实时显示
