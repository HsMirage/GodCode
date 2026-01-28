# Draft: CodeAll - 多LLM协同编程与多Agent协同工作软件

## 原始需求

开发一个独立的多LLM协同编程与多Agent协同工作软件,融合以下参考项目的核心优势:
- **oh-my-opencode**: 多LLM智能体协同编程框架
- **eigent**: 多Agent协同架构与工作流程拆解
- **ccg-workflow**: 任务调度与资源分配机制
- **hello-halo**: UI界面设计、内嵌浏览器、AI自动操控浏览器
- **moltbot**: 核心能力模块(排除CLI协同功能)

## 用户明确的技术栈建议
- pnpm + Electron + React + TypeScript + Claude Code SDK
- (具体由项目规划自行决定)

## 核心功能需求

### 1. 架构设计
- [ ] 集成oh-my-opencode的多LLM智能体协同编程框架
  - 多AI模型、多代理的协同
  - 并行后台任务工作机制
  - Hook生命周期治理
  - 持续执行/自动续跑
- [ ] 融合eigent的多Agent协同架构
  - 复杂工作流程的子任务拆解
  - 并行执行能力
- [ ] 借鉴ccg-workflow的调度系统设计
  - 高效的任务调度
  - 资源分配机制

### 2. 功能实现
- [ ] 完整移植moltbot的核心能力模块(排除CLI协同功能)
- [ ] 实现hello-halo的内嵌浏览器功能
- [ ] 实现AI自动操控浏览器技术
- [ ] 开发多视图并行的"工作台"式布局
- [ ] 支持Agent产物的可视化与追踪

### 3. 界面设计
- [ ] 采用hello-halo的UI界面设计风格
- [ ] 多视图并行的工作台布局
- [ ] 借鉴eigent的前端页面设计布局
- [ ] Agent产物"可视化、可追踪"的UI组件
- [ ] 可视化管理LLM模型和各个Agent设置

### 4. 技术要求
- [ ] 允许直接复制参考项目中的代码
- [ ] 确保代码兼容性与可维护性
- [ ] 独立应用运行,不依赖原有项目环境
- [ ] 模块间无缝集成
- [ ] 保证系统稳定性与性能

### 5. 开发流程
1. 完成核心架构设计,确定模块间接口与通信机制
2. 依次集成各参考项目的核心功能模块
3. 进行模块间联调与整体功能测试
4. 优化UI/UX设计

### 6. 交付标准
- [ ] 可独立运行的软件安装包
- [ ] 完整的源代码与文档
- [ ] 各功能模块的单元测试与集成测试报告
- [ ] 性能测试报告(多LLM模型协同、多Agent协同工作稳定性)

## 参考项目核心特点总结

### oh-my-opencode
- 三层分离架构: 规划层(Prometheus/Metis/Momus) → 执行层(Atlas) → 工作层(Sisyphus-Junior + 专家代理)
- delegate_task: 协同的中心API (category + skills系统)
- 并行后台任务系统: BackgroundManager + 并发限流
- Hook生命周期系统: 上下文注入、行为控制、持续执行
- IDE级工具链: LSP + AST-Grep
- .sisyphus体系: 计划、notepad、boulder.json状态机

### eigent
- 基于CAMEL-AI的Workforce架构
- 任务拆解 → 分配 → 并行执行 → 结果汇总
- SingleAgentWorker + Agent Pool
- 事件驱动的SSE通信
- React Flow可视化工作流
- MCP工具生态

### ccg-workflow
- 多模型协作: Claude(编排/决策) + Codex(后端) + Gemini(前端)
- Plan-Execute分离架构
- codeagent-wrapper: 并行DAG任务编排
- OpenSpec规范驱动
- Patch-only安全边界

### hello-halo
- Electron三段式架构
- SpacePage多视图布局: Chat + Artifact Rail + Content Canvas
- BrowserView内嵌Chromium
- AI Browser: CDP驱动 + 可访问树 + 26个工具
- Artifact Rail产物可视化
- 远程访问支持

### moltbot
- Subagents并行子任务系统
- 会话隔离与多Agent路由
- Gateway控制平面(WS协议)
- 技能与插件生态
- 工具策略与安全边界

## 待明确的问题

### 架构设计决策
- [ ] 技术栈最终选型确认?
  - Electron + React + TypeScript (确定)
  - Claude Code SDK vs 自研Agent框架?
  - 后端语言选择: TypeScript/Node.js vs Python?
  
- [ ] 多LLM协同的实现方式?
  - 直接移植oh-my-opencode的delegate_task机制?
  - 还是借鉴其思想重新实现?
  
- [ ] Agent协同架构选择?
  - 使用eigent的CAMEL Workforce?
  - 还是oh-my-opencode的三层架构?
  - 或者两者融合?

### 功能边界
- [ ] moltbot哪些"核心能力"需要移植?
  - Subagents系统 (确定需要)
  - Gateway控制平面?
  - 插件SDK?
  
- [ ] 浏览器功能的实现深度?
  - 完整移植hello-halo的26个AI Browser工具?
  - 还是实现基础的导航、截图、点击等核心功能?

### UI/UX设计
- [ ] 多视图布局的具体设计?
  - 直接使用hello-halo的SpacePage布局?
  - 还是参考eigent的工作流视图?
  - 或者创新设计融合两者?

- [ ] Agent产物可视化的形式?
  - Artifact Rail (hello-halo风格)?
  - React Flow工作流图 (eigent风格)?
  - 两者结合?

### 测试策略
- [ ] 是否需要设置测试基础设施?
  - 单元测试框架?
  - E2E测试?
  - 性能测试工具?

## 研究进展

### 并行探索任务
- [运行中] bg_0784f015: 探索oh-my-opencode核心架构
- [运行中] bg_3408fa02: 探索eigent的多Agent协同架构
- [运行中] bg_50d54f98: 探索hello-halo的UI和浏览器实现
- [运行中] bg_9ab41c2e: 探索moltbot的子代理系统
- [运行中] bg_3b066a17: 探索ccg-workflow调度系统

### 下一步
等待探索任务完成后,基于代码级发现进一步细化架构设计方案。
