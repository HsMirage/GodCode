# E2E 基线失败清零报告（PF-6）

## 1. 基本信息
- 报告类型：`e2e`
- 报告日期：`2026-03-03`
- 任务ID：`PF-6`
- 执行人：`Halo`

## 2. 背景与目标
- 目标：清零 `pnpm test:e2e` 的基线失败（文档原始基线为 9 个失败用例）。
- 范围：仅修复 E2E 用例与夹具中的过时选择器/断言，不改动业务逻辑。

## 3. 根因摘要
失败主要来自历史选择器与当前 UI 不一致：
- `Sessions` 头部在当前 UI 为 `Spaces`。
- `Create New Space` / `Space name...` 为旧交互模型，当前为 `button[title="New Space"]` + 直接创建流程。
- 部分 `GodCode` 文本定位命中多个元素，触发 Playwright strict mode 冲突。
- `waitForAppReady` 使用 `.h-screen` 作为 readiness 条件，不够稳定。

## 4. 修复内容
### 4.1 夹具稳定性修复
- 文件：`tests/e2e/fixtures/electron.ts`
- 变更：
  - `waitForAppReady` 从 `.h-screen` 改为等待 `h2:has-text("Spaces")` 与 `button[title="Settings"]`。

### 4.2 E2E 用例对齐当前 UI
- 文件：`tests/e2e/app-launch.spec.ts`
  - `Sessions` 断言改为 `Spaces`。
  - 主布局断言从 `.h-screen` 改为 `h2:has-text("Spaces")`。
- 文件：`tests/e2e/chat-workflow.spec.ts`
  - 主布局断言从 `.h-screen` 改为 `h2:has-text("Spaces")`。
  - `GodCode` 断言改为 `.first()` 避免 strict mode 冲突。
- 文件：`tests/e2e/mvp1.spec.ts`
  - `GodCode` 断言改为 `.first()`。
- 文件：`tests/e2e/mvp3.spec.ts`
  - `Sessions` 断言改为 `Spaces`。
  - 空间创建断言由旧选择器（`Create New Space` / `Space name...`）改为 `button[title="New Space"]` 并校验创建后侧边栏可交互。
  - 设置页访问改为点击后校验 `API服务商` 可见。
- 文件：`tests/e2e/settings.spec.ts`
  - `GodCode` 断言改为 `.first()`。
- 文件：`tests/e2e/space-management.spec.ts`
  - 旧选择器 `button[title="Create New Space"]` 替换为 `button[title="New Space"]`。
  - 旧“输入框出现/输入空间名”用例改为“创建后侧边栏保持可见”和“空间条目数量增加”断言（符合现实现实交互）。

## 5. 验证命令与结果
### 5.1 目标失败集回归
```bash
pnpm build && pnpm exec playwright test tests/e2e/app-launch.spec.ts tests/e2e/chat-workflow.spec.ts tests/e2e/mvp1.spec.ts tests/e2e/mvp3.spec.ts tests/e2e/settings.spec.ts tests/e2e/space-management.spec.ts
```
- 结果：`25 passed, 0 failed`

### 5.2 全量 E2E 基线验证
```bash
pnpm test:e2e
```
- 结果：`37 passed, 0 failed`

## 6. 非阻塞观测（未纳入 PF-6）
- 运行日志中仍有控制台提示：`IPC channel not allowed: browser:list-tabs`，但未导致 E2E 失败。
- 退出阶段偶发 `app.close() timed out` 警告（测试夹具已有强制回收兜底），本次验收不阻塞。

## 7. 验收结论
- 结论：`通过`
- 判定依据：
  - 原基线失败已清零。
  - 全量 `pnpm test:e2e` 为 `37/37` 通过。
