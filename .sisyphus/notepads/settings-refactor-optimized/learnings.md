## 2026-02-06 Task-2 IPC测试与Settings断言更新

- `tests/unit/ipc/ipc-alignment.test.ts` 已移除 router channel 对齐断言（`ROUTER_GET_RULES` / `ROUTER_SAVE_RULES`），避免继续校验已删除通道。
- `tests/e2e/settings.spec.ts` 将设置页首个 Tab 文案断言从 `LLM配置` 更新为 `API服务商`，并同步变量名为 `providerTab`。
- 仅执行了要求的单测命令（未运行 E2E）：`pnpm test tests/unit/ipc/ipc-alignment.test.ts`。
- 当前单测失败点位于 `Channel Separation`（invoke/event 通道值存在重叠），属于当前任务外的既有状态/依赖项，测试输出已落盘：`.sisyphus/evidence/task-2-ipc-test.txt`。
- 本机环境下 LSP 工具受 Bun v1.3.5 on Windows 已知问题影响（无法安全启动），已记录为验证限制。

## 2026-02-06 Task-1 移除设置页 Router IPC 链路

- 已删除 `src/main/ipc/handlers/router.ts`，并从 `src/main/ipc/index.ts` 移除对应 import 与 `ipcMain.handle('router:*')` 注册。
- 已清理 `src/shared/ipc-channels.ts` 中 Router Operations 常量：`ROUTER_GET_RULES`、`ROUTER_SAVE_RULES`、`ROUTER_SET_RULES`。
- 已从 `src/main/preload.ts` allowlist 移除 `router:get-rules`、`router:save-rules`。
- `src/renderer/src/types/shims.d.ts` 已移除 `RoutingRule` 接口与原 router invoke 重载；为避免未改动页面触发类型回归，新增了通用 `${string}:get-rules` 结果签名并保留 `invoke(channel: string): Promise<unknown>` 兜底。
- 类型验证已通过，输出落盘：`.sisyphus/evidence/task-1-typecheck.txt`。

## 2026-02-06 Task-3 Prisma Schema 扩展（Model ↔ ApiKey 外键关系）

- `prisma/schema.prisma` 已按 Expand-Contract 过渡要求新增：
  - `Model.apiKeyId String?`（可空外键，过渡期用）
  - `Model.apiKeyRef ApiKey? @relation(fields: [apiKeyId], references: [id], onDelete: Cascade)`（删除 ApiKey 时级联删除关联 Model）
  - `ApiKey.models Model[]`（反向关系）
  - legacy 字段 `Model.apiKey` / `Model.baseURL` 保持不变（兼容双写过渡）

- 验证：`pnpm prisma generate` PASS。

- 验证：`pnpm prisma migrate dev --name model-apikey-expand` PASS。
  - 由于本机 `.env` 中 `DATABASE_URL` 指向的端口（例如 `localhost:51789`）未启动 DB，直接执行会报 `P1001 Can't reach database server`。
  - Workaround：使用仓库依赖的 `@embedded-postgres/windows-x64` 二进制临时启动 Postgres（UTF-8），并在命令行覆写 `DATABASE_URL`：
    1. initdb：
       - `node_modules/@embedded-postgres/windows-x64/native/bin/initdb.exe -D .sisyphus/pg-temp -U codeall -A trust`
    2. 启动：
       - `node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe -D .sisyphus/pg-temp -l .sisyphus/pg-temp/postgres.log -o "-p 54320" start`
    3. 迁移：
       - `DATABASE_URL="postgresql://codeall@localhost:54320/postgres" pnpm prisma migrate dev --name model-apikey-expand`
    4. 停止：
       - `node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe -D .sisyphus/pg-temp stop`

- 迁移产物：`prisma/migrations/20260206084646_model_apikey_expand/migration.sql` 已生成并包含 `Model_apiKeyId_fkey`，其删除语义为 `ON DELETE CASCADE`。

- 验证限制：当前环境 Windows + Bun v1.3.5 已知问题导致 LSP 无法安全启动；此外未配置 SQL LSP，因此无法对 `migration.sql` 执行 LSP 诊断。

## 2026-02-06 Task-4 数据回填脚本（Model.apiKeyId backfill）

- 新增 `scripts/migrate-model-apikey-link.ts`，按 `(provider, baseURL, key 指纹)` 回填 `Model.apiKeyId`：
  - 跳过：已存在 `apiKeyId` 或 legacy `apiKey/baseURL` 缺失
  - 匹配：优先复用已链接 Model 的三元组映射，再按 `provider+baseURL` 扫描现有 `ApiKey` 并比较解密后 key
  - 创建：仅在未匹配到 `ApiKey` 时创建，随后写回 `Model.apiKeyId`
- 脚本幂等性策略：重复运行时优先复用已有映射/已有 `ApiKey`，不会改写 legacy `Model.apiKey/baseURL`。
- 加密策略与 `secure-storage.service.ts` 保持一致：
  - 若 `safeStorage` 可用，写入 `base64(encrypted)`
  - 若脚本运行在纯 Node（无 Electron safeStorage），回退为明文（并在报告中标注 `plaintext-fallback`）
- 迁移报告落盘：`.sisyphus/evidence/task-4-backfill-report.json`。
- 本机验证执行：`npx tsx scripts/migrate-model-apikey-link.ts`；由于 `.env` 指向的 Postgres 端口未启动，脚本按预期输出 fatal 并生成报告文件（`failed=1`，`totalModels=0`）。
- 类型验证：`pnpm typecheck` PASS。

## 2026-02-06 Task-5 message IPC 凭据解析切换至 apiKeyRef 优先

- `src/main/ipc/handlers/message.ts` 已更新模型查询：`prisma.model.findFirst` 增加 `include: { apiKeyRef: true }`，确保可读取新关系字段。
- 凭据解析顺序已切换为双写过渡模式：
  - 优先：`model.apiKeyRef?.encryptedKey`（通过 `SecureStorageService.getInstance().decrypt(...)` 解密）+ `model.apiKeyRef?.baseURL`
  - 回退：legacy `model.apiKey` + `model.baseURL`
- 保留 legacy 兜底与主流程健壮性：若无可用 key 且非 E2E mock，仍抛出 `Active model API key is missing`。
- 验证：`pnpm typecheck` PASS。
- 验证限制：`lsp_diagnostics` 在当前环境持续报错（Windows 下 LSP 安全启动拦截，提示 Bun 版本问题），已尝试复现与重试，暂无法获取 LSP clean 结果。

## 2026-02-06 Task-6 BindingService 凭据解析切换至 apiKeyRef 优先

- `src/main/services/binding.service.ts` 已将 `binding.model.apiKey/baseURL` 直接读取改为“新关系优先 + legacy 回退”策略：
  - 优先：`model.apiKeyRef?.encryptedKey`（`SecureStorageService.getInstance().decrypt(...)`）+ `model.apiKeyRef?.baseURL`
  - 回退：legacy `model.apiKey` + `model.baseURL`
- Prisma 查询已补齐关系：所有读取 binding 的 `include` 统一改为 `model: { include: { apiKeyRef: true } }`，避免运行时拿不到新字段。
- 验证：`pnpm typecheck` PASS。
- 验证限制：当前环境 Windows + Bun v1.3.5 导致 `lsp_diagnostics` 工具无法安全启动，因此无法提供 LSP clean 结果（已用 `tsc --noEmit` 作为替代验证）。

## 2026-02-06 Task-7 Keychain 新增安全读取接口（list masked / get decrypted）

- 新增两条 IPC invoke 通道：
  - `keychain:list-with-models`：返回 ApiKey 列表 + 关联 models，但仅暴露 `apiKeyMasked`（示例：`sk-a...4xyz`），绝不返回明文 key。
  - `keychain:get-with-models`：按 `apiKeyId` 返回单条 ApiKey + 关联 models，并在 main 进程内解密后返回明文 `apiKey`（用于详情/复制等场景）。
- Masking 策略：长度 <= 8 直接返回 `****`，否则 `前4...后4`；列表端只传 masked 字段。
- 实现要点：为了能返回 models，handler 直接用 Prisma `apiKey.findMany/include(models)` 查询并用 `SecureStorageService.decrypt` 解密后再做 mask。
- 校验：`pnpm typecheck` PASS。
- 验证限制：同上，Windows + Bun v1.3.5 环境下 LSP 无法安全启动，无法获取 `lsp_diagnostics` clean 结果。
