# 第一版跨平台发布闭环（2026-03-08）

## 交付结果

- 已建立平台门禁与能力门禁的分层发布矩阵。
- 已在 CI 中补齐原生 Windows 平台门禁作业。
- 已为 macOS / Windows 增加 boot smoke 自动检查。
- 已新增 `Release Gate Summary` 自动签署汇总，非全绿时直接失败。

## 代码落点

- 发布门禁矩阵：`src/shared/release-gate-matrix.ts`
- smoke 检查脚本：`scripts/release-smoke-check.ts`
- CI 门禁编排：`.github/workflows/ci.yml`

## 当前结论

- `P3-3` 已将“Windows 构建与启动仍靠人工判断”前移为“Windows 原生 CI 门禁”。
- 从本轮开始，发布签署的主口径变为 CI 自动门禁结果，而不是手工口头结论。
- 本地环境只验证了门禁契约、smoke 脚本与 YAML/类型正确性；真正的 Windows 闭环结果需在 CI 首次执行中产出。

