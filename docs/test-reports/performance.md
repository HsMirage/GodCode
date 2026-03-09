# 性能测试报告实例

## 1. 基本信息
- 报告类型：`performance`
- 报告日期：`2026-03-03`
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
  - `electron: ^28.0.0`

## 3. 执行命令（可复现）
```bash
pnpm test:performance
```

## 4. 结果摘要
- 总体状态：`PASS`
- 用例/场景总数：`29`
- 通过：`29`
- 失败：`0`
- 跳过：`0`
- 关键结论（1-3条）：
  1. 性能测试全量通过，未出现失败用例。
  2. 启动性能稳定采样结果为 `average 2090ms / worst 2094ms`，低于门槛（`<5000ms avg`、`<5500ms worst`）。
  3. 已补齐独立内存峰值采样证据（`peakHeapMB 36.88`，`peakRssMB 440.14`），并完成多轮回归日志归档。

## 5. 失败明细（无失败可写“无”）
无

## 6. 性能观测（性能测试必填，其他类型按需）
- 关键指标：
  - `Cold Start (stability sampling)`: `avg 2090ms / worst 2094ms`（目标：`avg < 5s, worst < 5.5s`）
  - `Concurrent Workflows (3 agents)`: `451ms`（目标：`< 30s`）
  - `Concurrent Workflows (5 agents)`: `512ms`（目标：`< 60s`）
  - `Repeated execution memory growth`: `+2MB`（目标：`< 100MB`）
- 资源占用：
  - `Peak Heap Used`: `36.88MB`（独立采样）
  - `Peak RSS`: `440.14MB`（独立采样）
  - `独立采样证据`: `docs/test-reports/evidence/2026-03-03/pf-7-startup-memory-samples-run-5.json`
- 稳定性结论：`通过（无条件）`

## 7. 验收结论
- 结论：`通过`
- 判定依据：
  1. `pnpm test:performance` 在多轮执行中全量通过（`29 passed, 0 failed`）。
  2. 启动性能波动已通过预热+多样本采样策略收敛并给出独立证据。
  3. 内存峰值采样已独立落盘，满足 PF-7 对“内存峰值证据补齐”的要求。
- 后续动作：
  - 在 PF-9 全绿复跑时复用同一采样策略并滚动归档证据。

## 8. 附件与归档
- 原始日志（多轮）：
  - `docs/test-reports/evidence/2026-03-03/pf-7-performance-run-4.log`
  - `docs/test-reports/evidence/2026-03-03/pf-7-performance-run-5.log`
- 启动内存采样：
  - `docs/test-reports/evidence/2026-03-03/pf-7-startup-memory-samples-run-4.json`
  - `docs/test-reports/evidence/2026-03-03/pf-7-startup-memory-samples-run-5.json`
- 关联文档：`docs/test-reports/performance-stability-closure.md`

## 9. 复核记录（P0-2-C）
- 复核时间：`2026-03-03`
- 复核人：`Halo`
- 依据命令：
  - `pnpm test:performance`
  - `pnpm exec vitest run "tests/performance/startup.test.ts" "tests/performance/concurrent.test.ts" "tests/performance/concurrent-agents.test.ts"`
- 复核结论：`性能报告已更新为无条件通过，且包含独立内存峰值证据。`

## 10. Changelog（PF-7）
- 2026-03-03：将总体状态从 `PARTIAL` 更新为 `PASS`（全量 `29 passed, 0 failed`）。
- 2026-03-03：补充启动稳定性采样结果与独立内存峰值采样证据。
- 2026-03-03：将验收结论由“通过（附条件）”修正为“通过（无条件）”。
- 2026-03-03：补充 PF-7 多轮回归日志与证据路径。
