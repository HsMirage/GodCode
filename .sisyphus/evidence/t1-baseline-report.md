# T1 基线与边界固化报告

日期: 2026-02-06
执行目录: `D:/AiWork/CodeAll`

## 1) 测试基线

### 1.1 `pnpm test` 完整输出

> 为避免报告体积失控，完整原始输出已原样落盘（未裁剪）：
>
> - `.sisyphus/evidence/t1-pnpm-test.log`（3217 行）
>
> 该文件即本次基线的“完整输出”归档。

#### `pnpm test` 失败摘要

- 命令: `pnpm test`
- 结果: **失败**
- 汇总:
  - `Test Files 22 failed | 48 passed (70)`
  - `Tests 72 failed | 543 passed (636)`
  - `Duration 35.27s`

失败测试文件（22）：

1. `tests/integration/chat-ipc.test.ts`
2. `tests/integration/full-workflow.test.ts`
3. `tests/performance/concurrent-agents.test.ts`
4. `tests/performance/concurrent.test.ts`
5. `tests/performance/database-load.test.ts`
6. `tests/unit/services/llm/factory.test.ts`
7. `tests/integration/ai-browser.test.ts`
8. `tests/integration/browser-automation.test.ts`
9. `tests/integration/browser-tools.test.ts`
10. `tests/integration/orchestration.test.ts`
11. `tests/integration/workforce-engine.test.ts`
12. `tests/performance/startup.test.ts`
13. `tests/unit/ipc/ipc-alignment.test.ts`
14. `tests/unit/services/database-retry.test.ts`
15. `tests/unit/services/database.test.ts`
16. `tests/unit/services/plan-file.test.ts`
17. `tests/unit/services/ai-browser/tools.test.ts`
18. `tests/unit/services/delegate/delegate-engine.test.ts`
19. `tests/unit/services/router/smart-router.test.ts`
20. `tests/unit/services/tools/builtin/file-list.test.ts`
21. `tests/unit/services/tools/builtin/file-read.test.ts`
22. `tests/unit/services/tools/builtin/file-write.test.ts`

### 1.2 `pnpm test:e2e` 完整输出

> 完整原始输出已原样落盘（未裁剪）：
>
> - `.sisyphus/evidence/t1-pnpm-test-e2e.log`（565 行）
>
> 该文件即本次基线的“完整输出”归档。

#### `pnpm test:e2e` 失败摘要

- 命令: `pnpm test:e2e`（内部包含 `pnpm build && playwright test`）
- 结果: **通过（含 1 个 skip）**
- 汇总:
  - `28 passed`
  - `1 skipped`
  - `28 passed (2.8m)`

---

## 2) 已知失败项白名单（供后续回归对照）

> 说明：仅用于“当前基线已知失败”对照，不代表可忽略质量问题。

### 2.1 全量白名单（来自 `pnpm test` 当前基线）

即上文 22 个失败测试文件。

### 2.2 四模块相关白名单（优先关注）

1. `tests/performance/concurrent-agents.test.ts`
2. `tests/integration/ai-browser.test.ts`
3. `tests/integration/browser-automation.test.ts`
4. `tests/integration/browser-tools.test.ts`
5. `tests/integration/orchestration.test.ts`
6. `tests/integration/workforce-engine.test.ts`
7. `tests/unit/services/ai-browser/tools.test.ts`
8. `tests/unit/services/delegate/delegate-engine.test.ts`

---

## 3) 允许变更路径（仅模块1-4）

### 模块1

- `src/renderer/src/layouts/`
- `src/renderer/src/components/panels/`

### 模块2

- `src/main/services/agent-run.service.ts`
- `src/main/services/artifact.service.ts`
- `src/renderer/src/components/artifact/`
- `src/renderer/src/components/agents/`

### 模块3

- `src/main/services/browser-view.service.ts`
- `src/main/services/ai-browser/`
- `src/renderer/src/components/browser/`

### 模块4

- `src/main/services/binding.service.ts`
- `src/main/services/delegate/`
- `src/renderer/src/components/settings/`

---

## 4) 当前受影响文件清单固化（基于允许路径范围扫描）

> 说明：本清单由 `git ls-files` + 路径扫描得到，用于边界对齐。

### 4.0 允许路径内“当前工作区改动”清单（`git status --porcelain`）

共 13 项：

- `M  src/main/services/ai-browser/tools/input.ts`
- `M  src/main/services/delegate/delegate-engine.ts`
- `M  src/renderer/src/components/browser/AIIndicator.tsx`
- `?? src/main/services/agent-run.service.ts`
- `?? src/main/services/artifact.service.ts`
- `?? src/main/services/binding.service.ts`
- `?? src/renderer/src/components/artifact/ArtifactList.tsx`
- `?? src/renderer/src/components/artifact/DiffViewer.tsx`
- `?? src/renderer/src/components/panels/BrowserPanel.tsx`
- `?? src/renderer/src/components/panels/TaskPanel.tsx`
- `?? src/renderer/src/components/settings/AgentBindingPanel.tsx`
- `?? src/renderer/src/components/settings/AgentCard.tsx`
- `?? src/renderer/src/components/settings/CategoryCard.tsx`

> 用途：该清单用于“防范围漂移”对照，后续任务如出现允许路径外变更应直接告警。

### 模块1（当前 `git ls-files` 结果）

- （空）

### 模块2

- `src/renderer/src/components/agents/AgentList.tsx`
- `src/renderer/src/components/agents/AgentWorkViewer.tsx`
- `src/renderer/src/components/artifact/ArtifactRail.tsx`
- `src/renderer/src/components/artifact/FileTree.tsx`
- `src/renderer/src/components/artifact/previews/CodePreview.tsx`
- `src/renderer/src/components/artifact/previews/ImagePreview.tsx`
- `src/renderer/src/components/artifact/previews/JsonPreview.tsx`
- `src/renderer/src/components/artifact/previews/MarkdownPreview.tsx`

### 模块3

- `src/main/services/ai-browser/index.ts`
- `src/main/services/ai-browser/tools/console.ts`
- `src/main/services/ai-browser/tools/emulation.ts`
- `src/main/services/ai-browser/tools/index.ts`
- `src/main/services/ai-browser/tools/input.ts`
- `src/main/services/ai-browser/tools/navigation.ts`
- `src/main/services/ai-browser/tools/network.ts`
- `src/main/services/ai-browser/tools/performance.ts`
- `src/main/services/ai-browser/tools/snapshot.ts`
- `src/main/services/ai-browser/types.ts`
- `src/main/services/browser-view.service.ts`
- `src/renderer/src/components/browser/AIIndicator.tsx`
- `src/renderer/src/components/browser/AddressBar.tsx`
- `src/renderer/src/components/browser/BrowserShell.tsx`
- `src/renderer/src/components/browser/NavigationBar.tsx`
- `src/renderer/src/components/browser/Toolbar.tsx`

### 模块4

- `src/main/services/delegate/agents.ts`
- `src/main/services/delegate/categories.ts`
- `src/main/services/delegate/delegate-engine.ts`
- `src/main/services/delegate/index.ts`
- `src/renderer/src/components/settings/ApiKeyForm.tsx`
- `src/renderer/src/components/settings/AuditLogViewer.tsx`
- `src/renderer/src/components/settings/DataManagement.tsx`
- `src/renderer/src/components/settings/ModelConfig.tsx`

---

## 5) 回归参照结论

- 本报告固定了 T1 时点的测试状态（单测失败基线 + E2E通过基线）。
- 后续任务必须以本报告为回归参照：
  - 不允许新增四模块外改动；
  - 失败数不应无解释扩散；
  - 新增失败需与本白名单逐条对比说明。
