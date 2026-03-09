# P0-1-B 修复启动链路（仅启动与环境准备）

## 任务信息
- 任务ID：P0-1-B
- 执行边界：仅修改启动与环境准备相关链路，不改测试用例业务断言
- 执行日期：2026-03-02

## 输入
- P0-1-A 结论：主阻塞为 E2E teardown 阶段超时
- `playwright.config.ts`
- `tests/e2e/fixtures/electron.ts`
- `src/main/index.ts`（只读核对，未改）

## 修复说明
### 变更文件
- `tests/e2e/fixtures/electron.ts`

### 具体修改
1. 新增 `closeElectronAppGracefully`，对 `app.close()` 增加 10s 超时控制。
2. 超时后执行兜底：对 Electron 子进程进行强制终止（`SIGKILL`），并做短暂等待释放。
3. 将 fixture teardown 从直接 `await app.close()` 改为 `await closeElectronAppGracefully(app)`。

## 命令与结果摘要
### 执行命令
- `pnpm test:e2e`

### 关键结果
- 测试已进入执行阶段并完成大规模运行：`Running 36 tests using 1 worker`
- 结果：`27 passed, 9 failed`
- 失败类型已从“启动前阻塞”转为“用例断言/页面元素不可见”等执行期失败
- 运行中出现 teardown 超时日志（由新增兜底捕获并处理）：
  - `[E2E] Graceful close timed out, forcing process termination`

## 验收结论（针对 P0-1-B）
- **通过**。
- 验收标准是“测试可进入执行阶段（不再卡在启动前）”，本次已满足。
- 当前剩余失败属于测试执行期问题，不在 P0-1-B 任务边界内。
