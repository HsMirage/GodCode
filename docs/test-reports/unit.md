# 单元测试报告实例

## 1. 基本信息
- 报告类型：`unit`
- 报告日期：`2026-03-02`
- 项目版本：`1.0.0`
- 分支：`master`（HEAD：`91a52d09`）
- 仓库状态：`Git 仓库（工作区有未提交改动）`
- 执行人：`Halo`

## 2. 环境信息
- 操作系统：`macOS 15.7.4 (24G517)`
- Node.js：`v20.20.0`
- 包管理器：`pnpm 10.11.0`
- 测试框架：`Vitest 1.6.1`
- 关键依赖版本：
  - `vitest: ^1.6.1`
  - `typescript: ^5.3.0`

## 3. 执行命令（可复现）
```bash
pnpm test -- "tests/unit/ipc/ipc-alignment.test.ts"
```

## 4. 结果摘要
- 总体状态：`FAIL`
- 用例/场景总数：`11`
- 通过：`10`
- 失败：`1`
- 跳过：`0`
- 关键结论（1-3条）：
  1. 单测命令可稳定复现失败样例。
  2. 当前失败集中在 IPC 通道冲突校验断言。
  3. 失败日志具备可追溯性，可直接用于后续修复回归。

## 5. 失败明细（无失败可写“无”）
| 序号 | 模块/用例 | 失败现象 | 直接证据（日志/截图/报告路径） | 初步原因 | 是否阻塞验收 |
|---|---|---|---|---|---|
| 1 | `tests/unit/ipc/ipc-alignment.test.ts` | `expected true to be false` | `.sisyphus/evidence/task-2-ipc-test.txt` | INVOKE/EVENT channel 存在重叠值 | 是 |

## 6. 性能观测（性能测试必填，其他类型按需）
- 本报告类型为单元测试，本节不适用。

## 7. 验收结论
- 结论：`未通过`
- 判定依据：
  1. 汇总显示 `1 failed | 10 passed`。
  2. 失败为断言失败，不属于环境偶发波动。
- 后续动作：
  - 修复 IPC 通道重叠问题后重跑同命令。
  - 通过后再纳入全量 `pnpm test` 回归。

## 8. 附件与归档
- 原始日志：`.sisyphus/evidence/task-2-ipc-test.txt`
- 测试报告产物：`.sisyphus/evidence/t1-pnpm-test.log`
- 关联文档：`docs/test-reports/_template.md`

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
  - `node -p "require('./package.json').devDependencies.vitest"`
  - `pnpm exec vitest --version`
- 复核结论：`环境字段已按当前仓库与执行环境真值修正。`

## 10. Changelog（P0-2-C）
- 2026-03-03：修正“分支/仓库状态”字段为当前仓库真值。
- 2026-03-03：补充复核信息（复核时间、复核人、依据命令）。
