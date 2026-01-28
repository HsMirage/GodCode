# Draft: 多LLM协同编程与多Agent协同工作软件 (CodeAll)

## Requirements (confirmed)

### User's Goal
开发独立的桌面应用,融合5个参考项目的核心优势:
- **oh-my-opencode**: 多LLM智能体协同编程框架,并行后台任务,Hook生命周期,持续执行/自动续跑
- **eigent**: 多Agent协同架构,复杂工作流程的子任务拆解与并行执行
- **ccg-workflow**: 任务调度系统设计理念,高效的任务调度与资源分配
- **clawdbot**: 核心能力模块(完整移植,但不包括CLI协同功能)
- **hello-halo**: 内嵌浏览器功能 + AI自动操控浏览器 + UI设计风格

### Technology Stack Suggestion
- pnpm + Electron + React + TypeScript + Claude Code SDK (用户表示"具体请根据项目自行决定")

### Confirmed Requirements
1. **架构设计**:
   - 多AI模型、多代理的协同
   - 并行后台任务工作机制
   - Hook生命周期治理
   - 持续执行/自动续跑
   - 复杂工作流程的子任务拆解与并行执行
   - 高效的任务调度与资源分配

2. **功能实现**:
   - 完整移植clawdbot核心能力模块(无缝集成)
   - 内嵌浏览器功能及AI自动操控浏览器技术
   - 多视图并行的"工作台"式布局
   - Agent产物的可视化与追踪

3. **界面设计**:
   - hello-halo的UI界面设计风格
   - 多视图并行工作台布局
   - eigent的前端页面设计布局
   - Agent产物"可视化、可追踪"的关键UI组件

4. **技术要求**:
   - 允许直接复制参考项目中的代码
   - 确保代码兼容性与可维护性
   - 独立应用运行,不依赖原有项目环境
   - 各模块间无缝集成
   - 整体系统稳定性与性能保证

5. **开发流程**:
   - 首先完成核心架构设计,确定模块间接口与通信机制
   - 依次集成各参考项目的核心功能模块
   - 模块间联调与整体功能测试
   - UI/UX设计优化

6. **交付标准**:
   - 可独立运行的软件安装包
   - 完整的源代码与文档
   - 各功能模块的单元测试与集成测试报告
   - 性能测试报告(多LLM模型协同,多Agent协同工作时的稳定性)

### Exclusions
- **明确排除**: clawdbot的CLI协同功能

## Research Findings

### Existing Project Planning Document
发现项目根目录已有 `项目规划.md`,包含:
- 详细的架构要求
- 构建命令和测试命令指南
- 代码风格规范(TypeScript strict mode, 2-space, semicolons等)
- 模块集成规则
- 性能和安全指南

### Reference Projects Analysis

#### 1. oh-my-opencode (v3.1.0)
**技术栈**: Bun + TypeScript + ESM
**核心模块**:
- `/src/agents/` - Agent定义和编排
- `/src/hooks/` - 生命周期Hook系统 (30+ hooks including session recovery, background notification, etc.)
- `/src/features/background-agent/` - 后台任务管理器 (BackgroundManager)
- `/src/features/claude-code-session-state/` - Session状态管理
- `/src/tools/` - 内置工具集 (LSP, AST-grep, delegate-task, interactive-bash等)
- `/src/mcp/` - Model Context Protocol集成
**关键依赖**: @opencode-ai/sdk, @anthropic-ai/sdk, @ast-grep/napi, @modelcontextprotocol/sdk
**插件系统**: OpenCode Plugin架构,支持Hook注入和工具扩展

#### 2. eigent (实际为 @stackframe/react)
**注意**: 此项目似乎不是eigent,而是stackframe的React认证库
**技术栈**: React + TypeScript + Tailwind
**需要进一步确认**: 用户提到的eigent多Agent架构是否在此项目中?

#### 3. ccg-workflow (v1.7.53)
**技术栈**: pnpm + Node.js + TypeScript + unbuild
**核心模块**:
- `/src/commands/` - CLI命令系统
- `/src/utils/` - 工具函数
- `/src/i18n/` - 国际化支持
**特色**: 多模型协作系统,智能路由工作流
**依赖**: cac (CLI框架), inquirer (交互式提示), ora (进度显示)

#### 4. clawdbot
**技术栈**: 模块化扩展系统
**结构**: `/extensions/` 目录包含多个插件 (bluebubbles, discord, google-chat等)
**核心能力**: 
- 多渠道通信 (BlueBubbles, Discord, Google Chat等)
- LLM任务执行
- 浏览器自动化 (需进一步确认具体实现)
**注意**: CLI协同功能需排除,仅迁移核心能力模块

#### 5. hello-halo (v1.2.12)
**技术栈**: Electron + React + TypeScript + Vite + Zustand
**架构**:
- `/src/main/` - Electron主进程 (index.ts, controllers, services, ipc, http)
- `/src/renderer/` - React渲染进程 (App.tsx, pages, components, stores)
- `/src/preload/` - Preload脚本 (IPC桥接)
- `/src/shared/` - 共享类型和工具
**核心能力**:
- 内嵌浏览器实现 (需查看具体实现细节)
- AI Agent SDK集成 (@anthropic-ai/claude-agent-sdk, @anthropic-ai/claude-code)
- 多视图UI (overlay.html, overlay-main.tsx)
- WebSocket通信 (ws)
- Cloudflared集成 (远程访问)
**UI库**: Lucide-react, Tailwind, CodeMirror (代码编辑器)
**测试**: Vitest (单元测试) + Playwright (E2E测试)

### Technical Stack Compatibility

| 项目 | 包管理器 | 构建工具 | 测试框架 | UI框架 |
|------|---------|---------|---------|--------|
| oh-my-opencode | Bun | Bun build + tsc | Bun test | - |
| eigent | pnpm | tsup | - | React + Tailwind |
| ccg-workflow | pnpm | unbuild | - | - |
| clawdbot | ? | ? | ? | - |
| hello-halo | npm | electron-vite (Vite) | vitest + playwright | React + Electron |

**兼容性考虑**:
- 推荐使用 **pnpm** (符合建议,与eigent/ccg-workflow一致)
- 推荐使用 **Vite** 构建 (hello-halo已使用)
- 推荐使用 **Vitest** 测试 (hello-halo已使用)
- Electron框架可直接采用hello-halo的配置
- TypeScript配置需统一为strict模式

### Integration Challenges Identified

1. **包管理器差异**: oh-my-opencode使用Bun,需要适配到pnpm
2. **构建系统差异**: Bun build vs Vite vs unbuild,需统一到Vite
3. **模块系统**: 统一为ESM (所有项目均支持)
4. **Agent SDK**: oh-my-opencode使用@opencode-ai/sdk, hello-halo使用@anthropic-ai/claude-agent-sdk,需整合
5. **Hook系统移植**: oh-my-opencode的Hook生命周期系统需要适配到新架构

## Open Questions

### ✅ 已确认的决策 (User Answers)
1. **项目名称**: **CodeAll** ✓
2. **技术栈**: **完全采用** pnpm + Electron + React + TypeScript + Claude Code SDK ✓
3. **LLM模型支持**: Claude (Anthropic) + OpenAI GPT + Google Gemini + 本地模型 + 其他模型 ✓
4. **测试策略**: **是,测试后置** (先实现功能再补充测试) ✓
5. **目标平台**: **Windows** (Windows 10/11 x64) ✓

### ❓ 待确认的问题

#### 关于Eigent多Agent架构的集成深度
从源码分析发现,eigent有完整的Python后端(FastAPI + CAMEL Workforce):
- **问题**: 是否需要移植eigent的Python后端逻辑,还是仅借鉴其前端UI设计和多Agent协作的**思想/模式**?
- **影响**: 
  - 完整移植 = 需要TypeScript重写Python后端逻辑(任务拆解/Workforce/Agent Pool等)
  - 仅借鉴思想 = 用oh-my-opencode的架构实现类似的多Agent协同能力

#### 关于Clawdbot模块的具体范围
clawdbot有大量模块(browser, agents, plugins, terminal, tui, web等):
- **问题**: "核心能力模块"具体指哪些? 需要全部移植还是有优先级?
- **建议优先模块**:
  1. `/src/browser/` - 浏览器自动化
  2. `/src/agents/` - Agent系统
  3. `/src/plugins/` + `/src/plugin-sdk/` - 插件架构
  4. `/src/terminal/` - 终端工具
  5. `/src/utils/` - 通用工具函数
- **可能排除**:
  - `/src/cli/` - CLI命令(用户已明确排除)
  - `/src/channels/` (Discord/Telegram/WhatsApp等通信渠道 - 与桌面应用需求不符)
  - `/src/gateway/` - 网关服务

#### 关于性能指标
- **问题**: 是否有具体的性能要求?
  - 并发Agent数量: 同时运行多少个Agent?
  - 响应时间: UI响应 < 100ms? Agent任务启动 < 3s?
  - 内存限制: 单个Agent < 500MB? 整体 < 2GB?
- **建议**: 如果暂无明确要求,可以参考hello-halo和oh-my-opencode的性能基准

#### 关于架构决策
考虑到5个项目的技术差异:
- **问题**: 核心架构应该以哪个项目为"骨架"?
- **建议方案**:
  - **主架构**: hello-halo (Electron + React框架) ✓
  - **Agent编排层**: oh-my-opencode (Hook系统 + 后台任务 + LSP工具) ✓
  - **多Agent协同**: eigent的思想 (任务拆解/并行执行/可视化)
  - **调度系统**: ccg-workflow的模式 (多模型路由/工作流管理)
  - **扩展能力**: clawdbot的插件系统 + 浏览器自动化

## Scope Boundaries
- **INCLUDE**: 
  - 5个参考项目的核心功能完整融合
  - 独立的桌面应用程序
  - 多LLM协同编程框架
  - 多Agent协同工作机制
  - 内嵌浏览器及AI控制
  - 可视化工作台界面
  - 完整的测试和文档
  
- **EXCLUDE**: 
  - clawdbot的CLI协同功能
  - 依赖原有项目环境的功能
