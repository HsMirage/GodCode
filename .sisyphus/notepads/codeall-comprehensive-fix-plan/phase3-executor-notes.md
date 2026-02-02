# Phase 3 执行者补充说明 (Tasks 11-17)

> **生成日期**: 2026-02-02
> **生成者**: Prometheus (Plan Verification Review)
> **目的**: 为 Phase 3 任务提供代码库现状分析，帮助执行者快速定位问题

---

## 概览

Phase 3 的任务基于 2026-02-02 的代码库分析进行了更新。以下是关键发现摘要：

| Task                | 状态              | 关键发现                            |
| ------------------- | ----------------- | ----------------------------------- |
| 11. WorkflowView    | ⚠️ 需要简单修复   | `ChatPage` 已有 toggle，但未被使用  |
| 12. AgentWorkViewer | ⚠️ 死代码         | 组件存在但零引用                    |
| 13. CI/CD           | ✅ 从零创建       | `.github/workflows/` 目录不存在     |
| 14. Updater         | ✅ 占位符URL      | `https://example.com/updates`       |
| 15. Hooks           | ⚠️ 事件系统休眠   | `WorkflowEventEmitter` 存在但未连接 |
| 16. E2E Tests       | ✅ 基础设施就绪   | Playwright 已配置                   |
| 17. 文档            | ⚠️ 声明与实现不符 | README 声称 Web 模式可用            |

---

## Task 11: WorkflowView 详细分析

### 问题本质

```
App.tsx → MainLayout → ChatView (简化版，无 toggle)
                    ↓
              ChatPage (有 toggle，但未使用) → WorkflowView
```

`ChatPage.tsx` 已经实现了完整的 Chat/Workflow 切换逻辑，但 `MainLayout` 直接使用了 `ChatView`，绕过了 `ChatPage`。

### 推荐修复 (最简方案)

```tsx
// src/renderer/src/components/layout/MainLayout.tsx

// 修改前:
import { ChatView } from './ChatView'

// 修改后:
import { ChatPage } from '../../pages/ChatPage'

// 在 Panel 中替换:
;<Panel defaultSize={60} id="chat">
  <ChatPage /> {/* 原来是 <ChatView /> */}
</Panel>
```

### 文件位置

- `src/renderer/src/pages/ChatPage.tsx` - 包含 `viewMode` state 和 toggle 按钮
- `src/renderer/src/components/layout/MainLayout.tsx:60-62` - 需要修改的位置
- `src/renderer/src/components/workflow/WorkflowView.tsx` - 目标组件

---

## Task 12: AgentWorkViewer 详细分析

### 问题本质

`AgentWorkViewer.tsx` 是 **完全的死代码**：

```bash
# 在整个代码库中搜索引用
grep -r "AgentWorkViewer" src/
# 结果: 只有定义文件本身，没有任何 import
```

### 组件接口 (需要确认)

执行前需要阅读 `AgentWorkViewer.tsx` 了解：

1. 它需要什么 props？
2. 它从哪里获取数据？(IPC? Context? Props?)
3. 是否有未完成的 TODO 注释？

### 推荐集成点

**方案 A (推荐)**: 在 WorkflowView 中作为详情面板

```tsx
// WorkflowView.tsx
const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

// 在节点点击时:
onNodeClick={(node) => setSelectedAgent(node.data.agentId)}

// 渲染:
{selectedAgent && <AgentWorkViewer agentId={selectedAgent} />}
```

**方案 B**: 在 ChatPage 中作为第三个 tab

```tsx
type ViewMode = 'chat' | 'workflow' | 'agents'
```

---

## Task 15: Hook 系统详细分析

### 现有代码

`src/main/services/workforce/events.ts` 已定义：

```typescript
export class WorkflowEventEmitter extends EventEmitter {
  // 事件类型已定义，但 WorkforceEngine 没有调用它
}

export const workflowEvents = new WorkflowEventEmitter()
```

### WorkforceEngine 需要添加的代码位置

`src/main/services/workforce/workforce-engine.ts`:

```typescript
// ~Line 180: 任务开始时
workflowEvents.emit('task:started', { taskId, sessionId, ... })

// ~Line 210: 任务完成时
workflowEvents.emit('task:completed', { taskId, result, ... })

// ~Line 240: 工作流完成时
workflowEvents.emit('workflow:completed', { sessionId, tasks: completedTasks })
```

### 不需要创建新文件

原计划要创建 `hook-registry.ts`，但现有的 `WorkflowEventEmitter` 已经足够。只需连接即可。

---

## Task 17: README 验证清单

### 需要验证的声明

| README 声明              | 验证命令                          | 预期结果                       |
| ------------------------ | --------------------------------- | ------------------------------ |
| `pnpm start:web` 可用    | `grep '"start:web"' package.json` | 检查脚本是否存在且指向有效文件 |
| "All 131 tasks complete" | 检查 boulder.json                 | 确认是否真的完成               |
| "Production Ready"       | `pnpm build && pnpm test`         | 应该全部通过                   |

### 可能需要修改的内容

1. 如果 `start:web` 不可用:

   ````markdown
   - **Web Server Mode** (Linux/Remote):

   * **Web Server Mode** (Linux/Remote) - _Planned_:
     ```bash

     ```

   - pnpm start:web

   * # Coming soon
   ````

   ```

   ```

2. 功能状态表:
   ```markdown
   | Feature       | Status               |
   | ------------- | -------------------- |
   | Desktop Mode  | ✅ Ready             |
   | Web Mode      | 🚧 Planned           |
   | Workflow View | ⚠️ Needs routing fix |
   ```

---

## 快速参考: 文件位置

```
src/renderer/src/
├── App.tsx                              # 路由定义
├── pages/
│   └── ChatPage.tsx                     # 有 workflow toggle (未使用)
└── components/
    ├── layout/
    │   ├── MainLayout.tsx               # 需修改: ChatView → ChatPage
    │   └── ChatView.tsx                 # 当前使用的简化版
    ├── workflow/
    │   └── WorkflowView.tsx             # 目标: 需要可访问
    └── agents/
        └── AgentWorkViewer.tsx          # 死代码: 需要集成

src/main/services/workforce/
├── events.ts                            # WorkflowEventEmitter (休眠)
└── workforce-engine.ts                  # 需添加 emit 调用

.github/workflows/                       # 不存在，需创建
```

---

## 执行顺序建议

```
1. Task 11 (WorkflowView) ─────┐
                               ├──→ Task 12 (AgentWorkViewer，依赖 11)
2. Task 13 (CI/CD) ───────────┤
3. Task 14 (Updater) ──────────┤
4. Task 15 (Hooks) ────────────┘

5. Task 16 (E2E Tests) ─────────→ 6. Task 17 (Docs，依赖 16)
```

Tasks 11, 13, 14, 15 可以并行执行 (Wave 4)。
Task 12 应在 Task 11 之后。
Task 17 应最后执行。

---

_Generated by Prometheus Plan Verification_
