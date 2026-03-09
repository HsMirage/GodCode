# P3-3 跨平台发布闭环 — 验收记录（2026-03-08）

## 目标

- 补齐 Windows 发布与启动验证，使发布门禁具备平台级可信度。
- 将平台发布门禁与 Agent 能力门禁分层管理。
- 让发布签署不再依赖人工口头判断。

## 实现摘要

- 新增门禁矩阵定义：`src/shared/release-gate-matrix.ts`
- 新增跨平台 boot smoke 脚本：`scripts/release-smoke-check.ts`
- 新增本地命令入口：`package.json`
  - `verify:release-smoke`
- 更新 CI：`.github/workflows/ci.yml`
  - `Platform Gate Windows`
  - `Platform Gate macOS`
  - `Agent Capability Gates`
  - `Release Gate Summary`
- 新增单测：`tests/unit/shared/release-gate-matrix.test.ts`

## 验收点对照

- Windows/macOS 核心门禁全部可回归：已实现 CI 层门禁与 smoke 检查脚本，Windows/macOS 均有独立回归入口。
- 发布签署不再依赖人工口头判断：已实现，`Release Gate Summary` 会自动汇总并在非全绿时失败。

## 验证命令

```bash
pnpm vitest tests/unit/shared/release-gate-matrix.test.ts --run
pnpm verify:release-smoke --platform current --candidate "$(command -v node)" --arg -e --arg "setInterval(() => {}, 1000)" --timeout-ms 300 --report /tmp/godcode-release-smoke.json
pnpm exec eslint src/shared/release-gate-matrix.ts scripts/release-smoke-check.ts tests/unit/shared/release-gate-matrix.test.ts
pnpm typecheck
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/ci.yml'); puts 'ci-yaml-ok'"
```

## 验证结果

- 单测通过：1 个文件、2 条测试全部通过。
- 本地 smoke 脚本通过：以 `node -e "setInterval(() => {}, 1000)"` 作为候选进程，脚本返回 `PASS`。
- 定向 lint 通过：新增发布门禁契约与 smoke 脚本无报错。
- 类型检查通过：`pnpm typecheck` 通过。
- CI YAML 语法 sanity check 通过：输出 `ci-yaml-ok`。

## 结论

- P3-3 已完成本轮实现、测试与验收闭环。
- 仍需在 CI 首次实际运行中产出 Windows 原生构建与 boot smoke 证据，以完成运行层证据归档。
