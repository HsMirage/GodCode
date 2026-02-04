# 修复 E2E 测试失败

## TL;DR

> **Quick Summary**: E2E 测试因应用未构建而全部失败。需要在运行测试前执行 `pnpm build`，并更新测试脚本确保自动构建。
>
> **Deliverables**:
>
> - 修改 `package.json` 中的 `test:e2e` 脚本，确保先构建再测试
> - 验证所有 E2E 测试通过
>
> **Estimated Effort**: Quick (~10分钟)
> **Parallel Execution**: NO - sequential
> **Critical Path**: 构建应用 → 运行测试 → 验证结果

---

## Context

### Original Request

用户运行 `pnpm test:e2e` 后，31个测试中有25个失败（81%失败率）。

### 诊断发现

**根本原因**: `out/` 目录为空 - 应用从未构建！

| 检查项              | 结果                                                    |
| ------------------- | ------------------------------------------------------- |
| `out/**/*.js`       | ❌ 没有找到任何文件                                     |
| `package.json.main` | `./out/main/index.js`                                   |
| 错误信息            | `electron.launch: Process failed to launch! exitCode=1` |

**错误链**:

1. `pnpm test:e2e` 执行
2. Playwright 尝试启动 Electron 并加载 `./out/main/index.js`
3. 文件不存在 → Electron 立即崩溃 (`exitCode=1`)
4. 所有依赖 Electron 启动的测试失败

---

## Work Objectives

### Core Objective

确保 E2E 测试在运行前自动构建应用，避免因缺少构建输出而失败。

### Concrete Deliverables

- 更新 `package.json` 中的 `test:e2e` 脚本

### Definition of Done

- [x] `pnpm test:e2e` 命令能够自动构建并运行测试
- [x] 所有 E2E 测试通过（或至少不因构建问题失败）

### Must Have

- 测试前自动构建

### Must NOT Have (Guardrails)

- 不修改测试用例本身
- 不改变应用代码
- 不引入额外的构建配置

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (Playwright E2E)
- **User wants tests**: 使用现有 E2E 测试验证
- **Framework**: Playwright

### Automated Verification

```bash
# 验证修复后测试通过
pnpm test:e2e

# 预期结果：
# - 应用正常构建
# - 测试正常运行
# - 通过率显著提高（不再因 electron.launch 失败）
```

---

## Execution Strategy

### 顺序执行

```
Step 1: 修改 package.json 中的 test:e2e 脚本
        └── 添加 "pnpm build &&" 前缀

Step 2: 运行 pnpm test:e2e 验证修复
        └── 确认测试不再因 electron.launch 失败
```

---

## TODOs

- [x] 1. 修改 package.json 的 test:e2e 脚本

  **What to do**:
  - 将 `"test:e2e": "playwright test"`
  - 修改为 `"test:e2e": "pnpm build && playwright test"`

  **Must NOT do**:
  - 不要修改其他脚本
  - 不要改变 build 脚本本身

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单文件简单修改，无复杂逻辑
  - **Skills**: []
    - 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `package.json:19` - 当前 test:e2e 脚本定义

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # 验证脚本已修改
  cat package.json | grep "test:e2e"
  # 预期输出包含: "pnpm build && playwright test"
  ```

  **Commit**: YES
  - Message: `fix(test): add build step before e2e tests`
  - Files: `package.json`
  - Pre-commit: N/A

---

- [x] 2. 验证 E2E 测试修复

  **What to do**:
  - 运行 `pnpm test:e2e`
  - 确认测试不再因 `electron.launch: Process failed to launch` 失败
  - 观察测试结果

  **Must NOT do**:
  - 不要修改测试用例
  - 不要跳过失败的测试

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 验证性任务，运行命令观察结果
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (depends on Task 1)
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:
  - `tests/e2e/fixtures/electron.ts` - Electron 启动 fixture
  - `playwright.config.ts` - Playwright 配置

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # 运行 E2E 测试
  pnpm test:e2e

  # 预期结果:
  # 1. build 成功完成
  # 2. out/main/index.js 生成
  # 3. 测试不再出现 "electron.launch: Process failed to launch"
  # 4. 测试通过率 > 80%
  ```

  **Evidence to Capture:**
  - [x] 终端输出显示 build 成功
  - [x] 终端输出显示测试运行（不再是启动失败）

  **Commit**: NO

---

## Commit Strategy

| After Task | Message                                      | Files        | Verification  |
| ---------- | -------------------------------------------- | ------------ | ------------- |
| 1          | `fix(test): add build step before e2e tests` | package.json | pnpm test:e2e |

---

## Success Criteria

### Verification Commands

```bash
pnpm test:e2e  # 预期: 测试运行，不再因 electron.launch 失败
```

### Final Checklist

- [x] `test:e2e` 脚本包含构建步骤
- [x] 测试能够正常启动 Electron 应用
- [x] 不再出现 `Process failed to launch` 错误
