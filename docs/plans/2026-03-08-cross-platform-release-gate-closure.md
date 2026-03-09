# 跨平台发布闭环方案（2026-03-08）

> 对应任务：P3-3 跨平台发布闭环

## 目标

- 补齐原生 Windows 发布门禁。
- 将平台发布门禁与 Agent 平台能力门禁分层管理。
- 让发布签署由 CI 门禁结果自动给出，不再依赖人工口头判断。

## 当前实现范围

- 新增发布门禁矩阵定义：`src/shared/release-gate-matrix.ts`
- 新增跨平台启动 smoke 检查脚本：`scripts/release-smoke-check.ts`
- 新增 Windows 原生平台门禁作业：`.github/workflows/ci.yml`
- macOS 平台门禁新增 boot smoke：`.github/workflows/ci.yml`
- 新增 Agent 能力门禁作业：`.github/workflows/ci.yml`
- 新增自动签署汇总作业：`.github/workflows/ci.yml`

## 分层门禁

### Platform Release Gates

- `RLS-BUILD-WIN`
- `RLS-BUILD-MAC`
- `RLS-BOOT-WIN`
- `RLS-BOOT-MAC`

### Agent Capability Gates

- `RLS-FLOW-CHAT`
- `RLS-FLOW-DELEGATE`
- `RLS-FLOW-BROWSER`

## CI 流程变化

- `Platform Gate Windows`：在 `windows-latest` 上执行 `pnpm build:win` 与 boot smoke。
- `Platform Gate macOS`：在 `macos-latest` 上执行 `pnpm build:mac` 与 boot smoke。
- `Agent Capability Gates`：在 Ubuntu 上执行 Chat / Delegate / Browser 三条核心流门禁。
- `Release Gate Summary`：汇总上述门禁状态，只要任一项不是 `PASS` 即自动失败。

## 当前限制

- 本地 macOS 环境无法直接完成原生 Windows 构建/启动验证，需依赖新增的 `windows-latest` Runner 在 CI 中闭环。
- boot smoke 目前验证的是“打包应用启动后在 smoke 窗口内不立即退出”，后续仍可继续补更深的 UI/核心流检查。

