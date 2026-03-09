# CodeAll

**Version 1.0.0** | **Beta** | **开发中**

CodeAll 是一个多模型协作编程平台（Multi-LLM Collaborative Programming Platform），是一个独立多agent协同（并且不同agent由不同LLM模型驱动）的方式工作软件。通过将本地工作区、多样化 AI 模型和浏览器自动化集成到统一的高性能环境中，帮助开发者编排复杂的软件开发任务。

基于 Electron 和 React 构建，CodeAll 作为一个强大的工作引擎，将高层级目标分解为可执行的子任务，由专门的 AI 智能体处理。

> **项目状态**: 积极开发中。Agent 系统基于中国神话命名体系，灵感来源于 oh-my-opencode 项目。

## 获取安装包

- **发布页**：`https://github.com/CakeSystem/CodeAll/releases`
- **本地构建产物**：执行 `pnpm build:mac` / `pnpm build:win` / `pnpm build:linux` 后，安装包输出到 `dist/`
- **更新策略**：当前保持手动更新模式，`electron-builder.yml` 尚未配置远程发布源

## 首次启动引导

1. 启动应用后先创建一个 **Space**，并绑定本地项目目录
2. 打开 **设置**，完成 API Key、Provider、Model 配置
3. 进入 **Agent 绑定**，为主 Agent / 类别绑定默认模型
4. 返回聊天页，选择会话并开始对话或提交复杂任务

## 基本使用流程

1. **创建空间**：将 Space 映射到你的本地仓库
2. **配置模型**：至少配置一个可用的 LLM Provider + Model
3. **开始对话**：在聊天窗口描述目标，普通任务可直接执行，复杂任务会由 Workforce 自动拆分
4. **观察执行**：在任务面板中查看 Task、后台任务、产物和工作流可观测性
5. **恢复会话**：应用异常退出后，可通过恢复提示继续会话或任务

---

## 核心功能

### 多模型编排
- 连接任何 OpenAI 兼容 API（自托管或 SaaS）
- 通过 Base URL + API Key 注册自定义模型
- 支持 OpenAI、Anthropic、Google Gemini 等多种 LLM 提供商

### 工作引擎
- 自动将复杂请求分解为有向无环图（DAG）任务
- 由专门智能体执行各类子任务
- 支持任务并行执行和依赖管理

### AI 控制浏览器
- 集成 Electron BrowserView 浏览器环境
- 支持文档研究、网页自动化、E2E 测试
- 智能体可自主进行网页操作

### 工作区隔离
- 以"空间"管理不同项目
- 直接映射本地文件系统
- 实时文件树同步

### 嵌入式数据库
- 零配置嵌入式 PostgreSQL
- Prisma ORM 提供可靠状态管理
- 任务持久化和审计日志

### 跨平台支持
- Windows 原生桌面应用
- macOS 和 Linux 构建支持

---

## 智能体系统

CodeAll 采用中国神话命名体系，包含 9 个专业化智能体：

### 主要智能体（Primary Agents）

| 代码 | 名称 | 描述 | 核心工具 |
|------|------|------|----------|
| `fuxi` | 伏羲 | 战略规划器，面试模式创建工作计划 | read, write, edit, bash, webfetch |
| `haotian` | 昊天 | 主编排器，任务分解、并行委派、TODO工作流 | read, write, edit, bash, glob, grep, delegate_task |
| `kuafu` | 夸父 | 工作计划执行器，任务分发与进度跟踪 | read, write, edit, bash, glob, grep, delegate_task |
| `luban` | 鲁班 | 自主深度工作者，深入研究后果断行动 | 全部工具 + 浏览器工具 |

### 辅助智能体（Subagents）

| 代码 | 名称 | 描述 | 核心工具 |
|------|------|------|----------|
| `baize` | 白泽 | 架构决策、代码审查、调试专家 | read, glob, grep |
| `chongming` | 重明 | 预规划分析，识别隐藏意图和歧义 | read, glob, grep |
| `leigong` | 雷公 | 计划审查，验证清晰度和完整性 | read |
| `diting` | 谛听 | 文档查找、开源实现、多仓库分析 | webfetch, websearch, context7, github_search |
| `qianliyan` | 千里眼 | 快速代码库探索、上下文搜索 | read, glob, grep |

---

## 工具系统

CodeAll 提供丰富的内置工具供智能体使用：

### 文件操作
- **file-read**: 读取文件内容，支持行范围
- **file-write**: 写入文件，自动创建目录
- **file-list**: 列出目录内容

### 代码搜索
- **grep**: 正则表达式搜索，支持上下文、类型过滤
- **glob**: 文件模式匹配，支持递归搜索

### 终端操作
- **bash**: 命令执行，支持超时、后台运行、安全检查

### 网络工具
- **webfetch**: 网页抓取，HTML 转 Markdown
- **websearch**: 网页搜索，多引擎支持

### 浏览器工具
- **browser_navigate**: 页面导航
- **browser_click**: 元素点击
- **browser_fill**: 表单填充
- **browser_snapshot**: 页面快照
- **browser_screenshot**: 屏幕截图
- **browser_extract**: 内容提取

### LSP 集成
- **lsp_diagnostics**: 代码诊断
- **lsp_definition**: 跳转定义
- **lsp_references**: 查找引用
- **lsp_symbols**: 符号搜索

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Electron 28+, Node.js 20+ |
| 前端 | React 18, TypeScript, Tailwind CSS |
| 状态管理 | Zustand |
| 数据库 | Prisma + embedded-postgres |
| 构建工具 | electron-vite, electron-builder |
| 测试 | Vitest, Playwright |
| LLM SDK | OpenAI SDK, Anthropic SDK, Google Generative AI |

---

## 快速开始

### 安装方式

- **最终用户**：优先从 GitHub Releases 下载对应平台安装包
- **开发者 / 本地试用**：按下面的源码方式安装并构建

### 环境要求

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v10+

### 安装步骤

1. **克隆仓库**

   ```bash
   git clone https://github.com/your-repo/codeall.git
   cd codeall
   ```

2. **安装依赖**

   ```bash
   pnpm install
   ```

3. **初始化数据库**

   ```bash
   pnpm prisma generate
   ```

### 运行应用

**开发模式**:

```bash
pnpm dev
```

**生产构建**:

```bash
# Windows
pnpm build:win

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

### 配置 LLM

1. 打开设置页面
2. 添加 API 密钥（支持 OpenAI、Anthropic、自定义端点）
3. 配置 Base URL（可选，用于自托管模型）
4. 注册模型名称

### 首次对话

1. 创建或选择一个会话
2. 在输入框中选择 Agent 预设（可选）
3. 输入目标，例如“分析仓库并修复测试失败”
4. 在任务面板中查看拆解后的工作流、后台任务和产物

> CodeAll 接受任何 OpenAI 兼容的端点，包括 Azure OpenAI、Ollama、vLLM 等。

---

## 常用命令

```bash
# 开发
pnpm dev              # 启动开发模式

# 测试
pnpm test             # 单元测试 (Vitest)
pnpm test:watch       # 监视模式
pnpm test:e2e         # E2E 测试 (Playwright)
pnpm test:performance # 性能测试

# 代码质量
pnpm lint             # ESLint 检查
pnpm typecheck        # TypeScript 类型检查
pnpm format           # Prettier 格式化

# 构建
pnpm build:win        # Windows
pnpm build:mac        # macOS
pnpm build:linux      # Linux
```

---

## 项目架构

```
src/
├── main/                    # 主进程 (Node.js)
│   ├── ipc/                 # IPC 处理器
│   │   └── handlers/        # 各类 IPC 处理函数
│   └── services/            # 核心服务
│       ├── delegate/        # 委托引擎和智能体
│       ├── llm/             # LLM 适配器
│       ├── tools/           # 工具注册和执行
│       ├── workforce/       # 任务分解引擎
│       ├── ai-browser/      # Playwright 浏览器
│       └── database.ts      # Prisma 客户端
├── renderer/                # 渲染进程 (React)
│   └── src/
│       ├── components/      # React 组件
│       ├── pages/           # 页面组件
│       └── store/           # Zustand 状态
├── preload/                 # 预加载脚本
└── shared/                  # 共享类型和常量
    ├── ipc-channels.ts      # IPC 通道定义
    └── agent-definitions.ts # 智能体定义
```

### IPC 通信

所有 IPC 通道定义在 `src/shared/ipc-channels.ts`:
- **INVOKE_CHANNELS**: 请求-响应模式 (渲染进程 → 主进程)
- **EVENT_CHANNELS**: 单向事件 (主进程 → 渲染进程)

### 数据模型

核心 Prisma 模型（`prisma/schema.prisma`）:
- **Space**: 工作区，映射本地目录
- **Session**: 会话，属于某个 Space
- **Message**: 消息，属于某个 Session
- **Task**: 任务，支持状态跟踪
- **Model**: LLM 模型配置
- **ApiKey**: 加密存储的 API 密钥

---

## 文档

详细文档位于 `docs/` 目录：

- [**快速开始**](docs/user-guide/getting-started.md): 安装配置和首次使用
- [**智能体系统**](docs/user-guide/agent-system.md): 智能体详解和使用方法
- [**工具使用**](docs/user-guide/tools.md): 工具功能和参数说明
- [**配置指南**](docs/user-guide/configuration.md): 完整配置选项
- [**API 参考**](docs/api-reference.md): IPC API 完整文档

---

## 许可证

本项目采用 **MIT 许可证**。

---

## 致谢

CodeAll 的设计灵感来源于以下开源项目：

- [oh-my-opencode](https://github.com/opencode-ai/oh-my-opencode): 多智能体协作概念和委托系统
- [eigent](https://github.com/stackframe-projects/eigent): 工作引擎任务分解架构
- [hello-halo](https://github.com/openkursar/halo): 嵌入式浏览器集成
- [moltbot](https://github.com/pashpashpash/moltbot): 子智能体生成机制
- [ccg-workflow](https://github.com/fengshao1227/ccg-workflow): 任务调度理念

---

_Powered by Electron + React + Multi-LLM_
