# WP-08 数据库 bootstrap 收敛 — 验收记录

## 1. 基本信息
- 工作包：`WP-08 数据库 bootstrap 收敛与证据矩阵`
- 日期：`2026-03-06`
- 范围：`src/main/services/database.ts`

## 2. 数据库启动全链路

```
init() ──── 单例 + 120s 超时
  └── _doInit()
      ├── Phase 1: loadOrCreateCredentials()     ← 密码管理
      ├── Phase 2: new PostgresManager()          ← 实例化管理器
      ├── Phase 3: postgresManager.initialise()   ← initdb (首次)
      ├── Phase 4: killPostgresProcesses() → start()  ← pg_ctl start
      ├── Phase 5: PrismaClient.$connect()        ← 20 次重试
      ├── Phase 6: ensureBaseSchema()             ← 首次建表
      └── Phase 7: ensureBindingSchemaCompatibility() ← 增量补丁
```

## 3. Embedded-Postgres 生命周期

| 阶段 | 方法 | 作用 |
|------|------|------|
| 初始化 | `PostgresManager.initialise()` | 若无 PG_VERSION，用 `initdb` 创建集群 |
| 启动 | `PostgresManager.start()` | `pg_ctl start`，等待 "server started" |
| 停止 | `PostgresManager.stop()` | `pg_ctl stop -m fast` |

## 4. Prisma 初始化步骤

1. 设置 `DATABASE_URL` 连接串
2. Windows 打包：设置 `PRISMA_QUERY_ENGINE_LIBRARY`
3. 打包环境：扩展 `NODE_PATH` + `Module._initPaths()`
4. 加载 PrismaClient（测试用 import，其他用 createRequire）
5. `$connect()` 最多重试 20 次
6. `ensureBaseSchema()` → 首次建表
7. `ensureBindingSchemaCompatibility()` → 增量补丁

## 5. Boot-time Patch 清单表

| # | 补丁类型 | 目标 | SQL | 退出条件 | 版本备注 |
|---|---------|------|-----|---------|---------|
| P1 | ADD COLUMN | `CategoryBinding.systemPrompt` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS "systemPrompt" TEXT` | 列已存在时跳过 | v0.2.0+ |
| P2 | ADD COLUMN | `AgentBinding.systemPrompt` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS "systemPrompt" TEXT` | 列已存在时跳过 | v0.2.0+ |
| P3 | ADD COLUMN | `Model.apiKeyId` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS "apiKeyId" TEXT` | 列已存在时跳过 | v0.3.0+ |
| P4 | CREATE TABLE | `SystemSetting` | `CREATE TABLE IF NOT EXISTS ...` + 索引 | 表已存在时跳过 | v0.4.0+ |
| P5 | CREATE TABLE | `SessionState` | `CREATE TABLE IF NOT EXISTS ...` + 索引 | 表已存在时跳过 | v0.4.0+ |
| P6 | DATA MIGRATION | `Model.config.apiProtocol` | UPDATE where provider IN (...) | 仅 protocol 不为 chat/completions 或 responses 时更新 | v0.5.0+ |

### 退出条件总则
- 所有补丁使用 `IF NOT EXISTS` / `IF EXISTS` 保证幂等
- 不做 DROP/RENAME，仅加法操作
- 当项目开始正式发布 Prisma migrations 后，可将已覆盖的补丁标记为 deprecated

## 6. 正式 Migration vs Boot-time Patch

| 类型 | 入口 | 来源 | 说明 |
|------|------|------|------|
| 正式迁移 | `ensureBaseSchema()` | `prisma/migrations/*/migration.sql` | 首次建表，读取 Prisma 迁移文件 |
| 启动补丁 | `ensureBindingSchemaCompatibility()` | 代码硬编码 | 增量 schema 补丁，跨版本兼容 |

## 7. 风险与结论

- **风险**：补丁数量随版本增长，需定期审查是否有过时补丁可以移除（当对应的正式 migration 覆盖后）。
- **结论**：WP-08 A 已完成数据库启动链路梳理、补丁清单建立与退出条件标注。

## 8. 兼容性测试补充（WP-08 A）

- 新增测试：`tests/unit/services/database.test.ts`
- 覆盖点：
  - Prisma 在 `database system is starting up` / `recovery mode` 下的连接重试
  - `ensureBindingSchemaCompatibility()` 的加法补丁执行
  - OpenAI 兼容 provider 的 `apiProtocol=responses` 启动迁移
- 验证命令：`pnpm vitest run tests/unit/services/database.test.ts`
- 验证结果：`6 passed`


## 9. Trace 贯穿落地（WP-08 B）

### 9.1 生成与入口
- `message` IPC 入口生成统一 `traceId`
- `buildMessageRuntimeContext()` 将 `traceId` 写入 user / assistant message metadata
- `SmartRouter.route()` 将 `traceId` 透传到 delegate 与 workforce

### 9.2 持久化与透传
- `DelegateEngine`：子任务 `Task.metadata.traceId` 持久化；LLM config/tool context 继续透传
- `WorkforceEngine`：workflow 根任务、subtask dispatch metadata、observability correlation/timeline 写入 `traceId`
- `tool execution`：`ToolExecutionContext` / `BrowserToolContext` / `HookContext` 增加 `traceId`
- `run logs`：工具批次与结果日志带 `traceId`，便于与任务/工作流对齐

### 9.3 前端定位入口
- `TaskPanel` 任务详情头部新增 `Trace ID`
- 诊断包文本新增 `Trace ID` 字段
- 结合任务 metadata / run log data，前端可从任务详情直接拿到同一条 trace 的关联标识

## 10. Trace 查询与调试指南

### 10.1 UI 路径
1. 打开任务面板 `TaskPanel`
2. 进入任务详情
3. 查看顶部 `Trace ID`
4. 再结合 run logs / workflow observability 对齐同一条链路

### 10.2 代码入口
- Message 入口：`src/main/ipc/handlers/message.ts`
- Message metadata：`src/main/services/message/message-runtime-context.service.ts`
- Router 透传：`src/main/services/router/smart-router.ts`
- Delegate 链路：`src/main/services/delegate/delegate-engine.ts`
- Workforce 链路：`src/main/services/workforce/workforce-engine.ts`
- Tool / Hook 上下文：`src/main/services/tools/tool.interface.ts`、`src/main/services/tools/tool-execution.service.ts`
- 前端展示：`src/renderer/src/components/panels/TaskPanel.tsx`

### 10.3 数据排查建议
- Message 表：检查 `Message.metadata.traceId`
- Task 表：检查 `Task.metadata.traceId`
- Workflow observability：检查 `metadata.correlation.traceId`、`timeline.*[].traceId`
- Run 日志：检查日志 `data.traceId`

## 11. WP-08 B 验证

- 聚焦回归：`pnpm vitest run tests/unit/ipc/message-ipc.test.ts tests/unit/services/delegate/delegate-engine.test.ts tests/unit/services/workforce/workforce-engine.test.ts tests/unit/renderer/task-panel-ui-diagnostics.test.tsx`
- 结果：`4 files passed, 100 tests passed`
- 补充回归：`pnpm vitest run tests/unit/services/database.test.ts`
- 结果：`1 file passed, 6 tests passed`
- 类型检查：`pnpm typecheck`
- 结果：本轮新增改动已清理，仅剩仓库既有错误：`src/renderer/src/components/browser/BrowserShell.tsx`、`tests/e2e/fixtures/electron.ts`、`tests/unit/services/browser-view.test.ts`、`tests/unit/services/workforce/wp02-verification.test.ts`

## 12. 最终结论

- **验证结果**：WP-08 A/B/C/D/E 已完成；数据库 bootstrap 兼容性、trace 贯穿、前端展示与验收文档均已闭环。
- **风险**：全量 `typecheck` 仍受既有存量问题影响，未在本工作包中一并修复。
- **结论**：WP-08 完成，可继续进入后续跨工作包通用验证或下一轮优化。
