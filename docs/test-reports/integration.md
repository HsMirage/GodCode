# 集成测试报告实例

## 1. 基本信息
- 报告类型：`integration`
- 报告日期：`2026-03-02`
- 项目版本：`1.0.0`
- 分支：`master`（HEAD：`91a52d09`）
- 仓库状态：`Git 仓库（工作区有未提交改动）`
- 执行人：`Halo`

## 2. 环境信息
- 操作系统：`macOS 15.7.4 (24G517)`
- Node.js：`v20.20.0`
- 包管理器：`pnpm 10.11.0`
- 测试框架：`Playwright 1.58.1`
- 关键依赖版本：
  - `playwright: ^1.57.0`
  - `electron: ^28.0.0`

## 3. 执行命令（可复现）
```bash
pnpm test:e2e
```

## 4. 结果摘要
- 总体状态：`PARTIAL`
- 用例/场景总数：`36`
- 通过：`27`
- 失败：`9`
- 跳过：`0`
- 关键结论（1-3条）：
  1. E2E 已从启动阻塞转为可执行状态。
  2. 当前主要问题为执行期断言与元素可见性失败。
  3. 自动化验收仍未达到全绿，需要继续修复失败用例。

## 5. 失败明细（无失败可写“无”）
| 序号 | 模块/用例 | 失败现象 | 直接证据（日志/截图/报告路径） | 初步原因 | 是否阻塞验收 |
|---|---|---|---|---|---|
| 1 | E2E 执行期用例（汇总） | `27 passed, 9 failed` | `docs/test-reports/p0-1-b-startup-fix.md` | 用例断言与元素可见性问题 | 是 |

## 6. 性能观测（性能测试必填，其他类型按需）
- 本报告类型为集成测试，本节不适用。

## 7. 验收结论
- 结论：`未通过`
- 判定依据：
  1. 当前 E2E 仍有 9 个失败用例。
  2. 失败已非启动链路问题，而是执行逻辑问题。
- 后续动作：
  - 对 9 个失败用例逐条归因并修复。
  - 修复后重跑 `pnpm test:e2e` 并更新验收文档。

## 8. 附件与归档
- 原始日志：`docs/test-reports/p0-1-b-startup-fix.md`
- 测试报告产物：`playwright-report/index.html`, `test-results/.last-run.json`
- 关联文档：`docs/final-acceptance.md`, `docs/test-reports/_template.md`

## 9. 复核记录（P0-2-C）
- 复核时间：`2026-03-03`
- 复核人：`Halo`
- 依据命令：
  - `pwd`
  - `git rev-parse --is-inside-work-tree`
  - `git rev-parse --abbrev-ref HEAD`
  - `git rev-parse --short HEAD`
  - `git status --short`
  - `node -v`
  - `pnpm -v`
  - `sw_vers`
  - `node -p "require('./package.json').version"`
  - `node -p "require('./package.json').devDependencies['@playwright/test']"`
  - `pnpm exec playwright --version`
- 复核结论：`环境字段已按当前仓库与执行环境真值修正。`

## 10. Changelog（P0-2-C）
- 2026-03-03：修正“分支/仓库状态”字段为当前仓库真值。
- 2026-03-03：修正测试框架版本为实测版本（Playwright 1.58.1）。
- 2026-03-03：补充复核信息（复核时间、复核人、依据命令）。
