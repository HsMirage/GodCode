# GodCode Agent 开发指南

本文档介绍了 GodCode 的 Agent 系统架构、配置方法以及如何创建和调试自定义 Agent。

## 1. 系统架构

GodCode 的 Agent 系统由两个核心引擎驱动：

### 1.1 WorkforceEngine (劳动力引擎)

负责高层目标的编排。它通过以下步骤处理任务：

- **任务分解 (Decomposition)**：利用 LLM 将复杂任务拆分为 3-5 个子任务。
- **DAG 构建**：建立子任务之间的依赖关系图（Directed Acyclic Graph）。
- **并行执行**：根据依赖关系，在满足 `MAX_CONCURRENT` 限制的前提下并行执行子任务。

### 1.2 DelegateEngine (委托引擎)

负责具体原子任务的执行。它根据任务的 `category` 或 `subagent_type` 选择合适的模型配置。

## 2. 核心区别：Delegate vs Workforce

| 特性       | Workforce          | Delegate               |
| :--------- | :----------------- | :--------------------- |
| **职责**   | 规划与协调         | 执行与产出             |
| **产出**   | 多个子任务的执行流 | 单个原子任务的结果     |
| **并行性** | 支持并行子任务     | 顺序处理单个提示词     |
| **上下文** | 关注全局目标和依赖 | 关注具体指令和工具使用 |

## 3. Agent 配置说明

### 3.1 类别配置 (Categories)

在 `src/main/services/delegate/categories.ts` 中定义，用于根据任务性质快速选择模型。

```typescript
export const categories: Record<string, CategoryConfig> = {
  quick: {
    model: 'claude-3-haiku-20240307',
    temperature: 0.3
  },
  ultrabrain: {
    model: 'gpt-4',
    temperature: 0.2
  }
}
```

### 3.2 子代理配置 (Sub-agents)

在 `src/main/services/delegate/agents.ts` 中定义，通常具有特定的角色和工具集。

```typescript
export const agents: Record<string, AgentConfig> = {
  explore: {
    type: 'readonly',
    model: 'claude-3-5-sonnet-20240620',
    tools: ['grep', 'read', 'glob']
  }
}
```

## 4. 开发新 Agent 的步骤

1.  **定义角色与职责**：确定新 Agent 是通用执行者（Executor）还是只读分析者（Readonly）。
2.  **注册 Agent**：在 `src/main/services/delegate/agents.ts` 的 `agents` 对象中添加配置。
3.  **配置 LLM 适配器**：如果使用新的 Provider，需在 `src/main/services/llm/factory.ts` 中添加支持。
4.  **（可选）添加工具**：如果 Agent 需要特殊能力，需在工具集中注册并赋予权限。
5.  **调用测试**：通过 `DelegateEngine.delegateTask` 进行原子测试，或通过 `WorkforceEngine` 进行集成测试。

## 5. 调试技巧

- **日志查看**：利用 `LoggerService` 查看任务流转和 LLM 原始响应。
- **数据库监控**：通过 Prisma 直接检查 `Task` 表的状态、输入、输出和元数据（metadata）。
- **模型切换**：在开发阶段可以使用更低成本的模型（如 Haiku）进行流程验证，稳定后再切换至高强度模型。

## 6. 最佳实践

- **原子化**：确保传递给 Delegate 的任务描述足够具体，能够独立完成。
- **依赖最小化**：在 Workforce 分解任务时，尽量减少不必要的串行依赖以提高效率。
- **温度控制**：对于逻辑推导任务使用低 Temperature (0.2-0.3)，对于创意写作使用高 Temperature (0.7-0.8)。

---

_Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-opencode)_
