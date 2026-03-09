# PF-7 性能稳定性与内存峰值证据闭环

## 1. 任务信息
- 任务ID：`PF-7`
- 任务目标：将性能结论从“通过（附条件）”提升为“无条件通过”，并补齐内存峰值独立采样证据。
- 执行日期：`2026-03-03`
- 执行人：`Halo`

## 2. 变更范围
- 测试代码：
  - `tests/performance/startup.test.ts`
  - `tests/performance/concurrent.test.ts`
  - `tests/performance/concurrent-agents.test.ts`
- 报告文档：
  - `docs/test-reports/performance.md`

## 3. 关键修复与优化
1. **启动性能稳定性策略收敛**
   - 将单次阈值断言改为“预热 + 3 次采样 + 平均值/最坏值”策略。
   - 阈值定义：`average < 5000ms`，`worst < 5500ms`。
2. **独立内存峰值采样落盘**
   - 在启动采样流程中记录 `heapUsedMB`、`rssMB`、`externalMB`。
   - 采样结果输出至 JSON，归档到证据目录。
3. **并发性能测试链路修复**
   - 为性能测试中的 Prisma mock 补齐 `systemSetting` 存储委托。
   - 为 mock 的默认模型补充 `defaultModelId` 与 `apiProtocol` 配置，消除 `MODEL_NOT_CONFIGURED`/`MODEL_PROTOCOL_NOT_CONFIGURED` 错误。

## 4. 执行命令与结果
### 4.1 全量性能回归
```bash
pnpm test:performance
```
- 结果：`PASS`
- 关键快照（run-5）：`Test Files 6 passed (6) / Tests 29 passed (29)`

### 4.2 目标子集验证
```bash
pnpm exec vitest run "tests/performance/startup.test.ts" "tests/performance/concurrent.test.ts" "tests/performance/concurrent-agents.test.ts"
```
- 结果：`PASS`
- 关键快照：`Test Files 3 passed (3) / Tests 7 passed (7)`

## 5. 独立证据归档
- 运行日志：
  - `docs/test-reports/evidence/2026-03-03/pf-7-performance-run-4.log`
  - `docs/test-reports/evidence/2026-03-03/pf-7-performance-run-5.log`
- 启动内存采样：
  - `docs/test-reports/evidence/2026-03-03/pf-7-startup-memory-samples-run-4.json`
  - `docs/test-reports/evidence/2026-03-03/pf-7-startup-memory-samples-run-5.json`

## 6. 核心指标（采样结果）
来源：`pf-7-startup-memory-samples-run-5.json`
- warmup: `2075ms`
- samples: `2082ms, 2094ms, 2093ms`
- average: `2090ms`
- worst: `2094ms`
- peakHeapMB: `36.88MB`
- peakRssMB: `440.14MB`

## 7. 验收结论
- 结论：`通过`
- 判定：满足 PF-7 验收标准
  - 无失败用例：✅
  - 内存峰值独立证据：✅
  - 报告结论更新为无条件通过：✅
