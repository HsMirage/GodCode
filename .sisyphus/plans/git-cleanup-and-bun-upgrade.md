# Git 临时文件清理与 Bun 升级计划

## TL;DR

> **Quick Summary**: 对仓库执行一次性临时文件清理并补齐持久忽略规则，同时将 Bun 升级到 `>=1.3.6` 以规避 Windows + Bun v1.3.5 的 LSP 崩溃问题。  
> **Deliverables**:
>
> - 临时产物一次性清理完成（白名单范围）
> - `.gitignore` 增加稳定忽略规则
> - Bun 升级到 `>=1.3.6` 并完成版本/基本可用性验证
>
> **Estimated Effort**: Short  
> **Parallel Execution**: NO（顺序执行，避免状态干扰）  
> **Critical Path**: 清理白名单产物 → 更新 `.gitignore` → 升级 Bun → 升级后验证

---

## Context

### Original Request

用户要求：

1. 清理临时文件（建议 `git checkout -- .sisyphus/boulder.json` 或加入 `.gitignore`）
2. 升级 Bun（当前 v1.3.5，建议 v1.3.6+）

### Interview Summary

- 用户确认临时文件策略：**两者都做**（一次性清理 + 持久忽略）
- 用户确认 Bun 升级方式：**自动检测并升级**（优先 winget，失败时回退）

### Metis Review

**Identified Gaps（已处理）**:

- 安装方式未知：在执行中自动检测（winget/scoop/npm/官方安装器）
- 误删风险：严格白名单清理，禁止触碰 `.sisyphus/plans|notepads|evidence`
- 验收不够具体：补充可执行命令与明确预期输出

---

## Work Objectives

### Core Objective

在不修改业务代码的前提下，完成仓库临时文件治理与 Bun 运行时升级，恢复更稳定的本地开发基础设施。

### Concrete Deliverables

- 白名单临时文件/目录清理完成：
  - `.sisyphus/boulder.json`（若存在）
  - `test-results/`
  - `playwright-report/`
- `.gitignore` 新增规则：
  - `.sisyphus/boulder.json`
  - `test-results/`
  - `playwright-report/`
- Bun 版本升级并验证：`bun --version >= 1.3.6`

### Definition of Done

- [x] 白名单临时产物清理完成且验证不存在
- [x] `.gitignore` 规则追加完成且验证生效
- [x] Bun 升级完成，版本满足 `>=1.3.6` (当前 1.3.8)
- [x] 升级后 `bun install` 成功完成

### Must Have

- 只处理 Git 临时文件治理与 Bun 升级
- 升级流程提供回退分支（当首选升级方式失败）

### Must NOT Have (Guardrails)

- 不修改任何业务源码（`.ts/.tsx/.js`）
- 不删除 `.sisyphus/plans/`、`.sisyphus/notepads/`、`.sisyphus/evidence/`
- 不扩展到 LSP 深度修复（仅做 Bun 升级与基础验证）

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**  
> 所有验收必须由执行器命令自动验证，不依赖人工点击/目测。

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: None（本任务为环境治理）
- **Agent-Executed QA**: 必须（命令行验证）

### Agent-Executed QA Scenarios (MANDATORY)

Scenario: 白名单临时文件清理验证  
 Tool: Bash  
 Preconditions: 仓库路径有效  
 Steps:

1. 检查目标是否存在（`test-results/`, `playwright-report/`, `.sisyphus/boulder.json`）
2. 执行白名单删除
3. 重新检查目标路径不存在
   Expected Result: 三个目标均不存在或为空  
   Failure Indicators: 任何目标路径仍存在且含内容  
   Evidence: `.sisyphus/evidence/cleanup-verification.log`

Scenario: `.gitignore` 规则验证  
 Tool: Bash  
 Preconditions: `.gitignore` 可写  
 Steps:

1. 追加缺失规则（不覆盖既有内容）
2. grep/文本检查三条规则均存在
3. 运行 `git status --short` 确认清理目录不再反复出现
   Expected Result: 三条规则存在且状态干净（或仅非本任务文件）  
   Failure Indicators: 规则缺失、被覆盖、状态仍持续污染  
   Evidence: `.sisyphus/evidence/gitignore-verification.log`

Scenario: Bun 升级与回退路径验证  
 Tool: Bash  
 Preconditions: 网络可用，包管理工具可调用  
 Steps:

1. 记录升级前版本 `bun --version`
2. 优先 `winget` 升级；失败则尝试 `scoop`；再失败则 `npm -g` 或官方安装器命令
3. 升级后执行 `bun --version` 并断言 `>=1.3.6`
4. 执行 `bun install` smoke 验证
   Expected Result: 版本达标且安装命令成功  
   Failure Indicators: 版本未提升、命令失败、退出码非 0  
   Evidence: `.sisyphus/evidence/bun-upgrade.log`

---

## Execution Strategy

### Parallel Execution Waves

Wave 1:

- Task 1: 白名单清理（一次性）

Wave 2:

- Task 2: `.gitignore` 持久规则追加与验证

Wave 3:

- Task 3: Bun 升级（自动检测路径）

Wave 4:

- Task 4: 升级后验证与收口

Critical Path: 1 → 2 → 3 → 4

---

## TODOs

- [x] 1. 执行白名单临时文件清理

  **What to do**:
  - 仅清理白名单：`.sisyphus/boulder.json`、`test-results/`、`playwright-report/`
  - 清理前后均输出路径状态到日志

  **Must NOT do**:
  - 不删除 `.sisyphus/plans|notepads|evidence`

  **Recommended Agent Profile**:
  - **Category**: `quick`（单点环境治理）
  - **Skills**: `git-master`（涉及工作区状态治理）

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: None
  - **Blocks**: 2,3,4

  **References**:
  - `.sisyphus/boulder.json` - 运行时进度状态文件（临时）
  - `test-results/`, `playwright-report/` - 测试生成物目录（临时）

  **Acceptance Criteria**:
  - [ ] 三个目标路径清理后不存在（或目录为空）
  - [ ] 结果写入 `.sisyphus/evidence/cleanup-verification.log`

- [x] 2. 更新 `.gitignore`，防止临时文件再次污染

  **What to do**:
  - 以追加方式补齐以下规则（若不存在才追加）：
    - `.sisyphus/boulder.json`
    - `test-results/`
    - `playwright-report/`

  **Must NOT do**:
  - 不覆盖 `.gitignore` 全文件
  - 不删除已有规则

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `git-master`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: 1
  - **Blocks**: 4

  **References**:
  - `.gitignore` - 全局忽略规则入口

  **Acceptance Criteria**:
  - [ ] 三条规则存在且仅出现一次
  - [ ] `git status --short` 不再因上述临时目录持续脏化

- [x] 3. Bun 自动检测并升级到 `>=1.3.6`

  **What to do**:
  - 记录升级前版本
  - 按顺序尝试升级路径：winget → scoop → npm/global → 官方安装器
  - 升级后复核版本

  **Must NOT do**:
  - 不改项目依赖定义文件（`package.json` 等）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: `git-master`（环境操作需可追踪）

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: 1
  - **Blocks**: 4

  **References**:
  - Bun 官方安装文档（升级路径与版本验证）

  **Acceptance Criteria**:
  - [ ] 升级前后版本记录在 `.sisyphus/evidence/bun-upgrade.log`
  - [ ] 升级后 `bun --version >= 1.3.6`

- [x] 4. 升级后可用性验证与收口

  **What to do**:
  - 运行 `bun install` 验证运行时可用
  - 汇总日志与结论到证据文件

  **Must NOT do**:
  - 不扩展为 LSP 深度诊断/修复任务

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `git-master`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: 2,3
  - **Blocks**: None

  **Acceptance Criteria**:
  - [ ] `bun install` 成功（退出码 0）
  - [ ] 验证结论输出到 `.sisyphus/evidence/bun-upgrade.log`

---

## Success Criteria

### Verification Commands

```bash
bun --version
bun install
git status --short
```

### Final Checklist

- [x] 白名单临时文件已清理
- [x] `.gitignore` 已持久化忽略规则
- [x] Bun 版本已升级到 `>=1.3.6` (当前 1.3.8，无需升级)
- [x] 升级后基础命令可用 (bun install 成功)
