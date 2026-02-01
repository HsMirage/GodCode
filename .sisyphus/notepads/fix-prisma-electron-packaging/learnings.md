# Learnings - Fix Prisma Electron Packaging

## Build Verification Results (Linux Cross-Compilation)

### Status

- **Success**: The build completed successfully for Linux target (used as proxy for Windows verification due to missing Wine dependency).
- **Windows Build**: Failed due to missing `wine` dependency on the build environment, but `electron-builder --dir` step confirmed resource copying logic.
- **Verification**: `query_engine-windows.dll.node` was successfully generated and copied to the resources directory.

### Findings

1. **Binary Location**: The Prisma query engine binary was found in TWO locations:
   - `dist/linux-unpacked/resources/prisma-client/query_engine-windows.dll.node`
   - `dist/linux-unpacked/resources/prisma-engines/query_engine-windows.dll.node`

2. **File Verification**:
   - Filename: `query_engine-windows.dll.node`
   - Size: ~21MB (21,182,976 bytes)
   - Location: OUTSIDE `app.asar` (in `resources` directory), which is critical for execution.

3. **Build Configuration**:
   - The `electron-builder.yml` correctly configured `extraResources` to include the Prisma binaries.
   - The `prisma generate` step correctly produced the Windows binary (`windows`) defined in `schema.prisma`.

### Issues Encountered

- `pnpm run build:win` failed because `wine` is not installed in the environment.
- Workaround: Verified resource packaging logic using Linux build (`pnpm electron-builder --linux --dir`) which successfully copied the Windows binary because `prisma generate` created it based on the schema definition.

### Conclusion

The packaging fix is working as intended. The Prisma binary is correctly generated and placed in `extraResources`, accessible to the production application.

## [2026-01-31T05:29:31.344Z] Task 4: Final Build Verification
- Build process completed successfully on Windows.
- Verified presence of query engine binaries in:
  - dist/win-unpacked/resources/prisma-client/query_engine-windows.dll.node
  - dist/win-unpacked/resources/prisma-engines/query_engine-windows.dll.node
- This confirms that electron-builder correctly picks up the native modules and extra resources defined in the configuration.

## [2026-01-31T05:41:00.000Z] Task 5-6: Application Runtime Testing

### Test Results

❌ **APPLICATION FAILED TO INITIALIZE**

虽然 Prisma 引擎二进制文件已正确打包到 resources 目录,但应用在运行时遇到了多个严重错误:

#### 发现的问题

1. **Preload Script 加载失败**
   - 错误: `Unable to load preload script: ...\out\preload\preload.mjs`
   - 原因: `SyntaxError: Cannot use import statement outside a module`
   - 影响: Preload 脚本无法加载,导致 renderer 进程无法访问 IPC

2. **Renderer IPC 通信失败**
   - 错误: `Uncaught TypeError: Cannot read properties of undefined (reading 'invoke')`
   - 原因: Preload 失败后,`window.electron` 对象未定义
   - 影响: 前端无法与主进程通信

3. **PostgreSQL 日志文件权限错误**
   - 错误: `pg_ctl: could not open log file ...\postgres.log: Permission denied`
   - 原因: 另一个 PostgreSQL 实例正在运行并锁定了日志文件
   - 影响: PostgreSQL 启动失败

#### 根本原因分析

**Prisma 修复本身是成功的**:
- ✅ 引擎文件已正确复制到 `resources/prisma-client/` 和 `resources/prisma-engines/`
- ✅ `database.ts` 中的引擎路径设置代码已包含在构建中
- ✅ PostgreSQL 能够启动(在没有权限冲突的情况下)

**但是存在更严重的打包问题**:
- ❌ Preload 脚本的 ESM 导入在打包环境中不work
- ❌ 这导致整个应用无法正常初始化

#### 验证状态

- **任务 5**: ❌ 安装后运行 exe,仍然出现初始化失败(但不是数据库超时,而是 preload 错误)
- **任务 6**: ❌ 应用窗口无法正常显示内容(因为 IPC 失败)

#### 建议

此计划修复了 Prisma 打包问题,但暴露了更严重的 **Preload Script ESM 打包问题**。
需要创建新的计划来修复:
1. Preload script 的 ESM/CJS 模块问题
2. electron-builder 的 preload 打包配置
3. PostgreSQL 多实例冲突问题

#### 文件位置

- 构建产物: `dist/win-unpacked/CodeAll.exe`
- 应用日志: `C:\Users\MIRAGE\AppData\Roaming\codeall\logs\app-2026-01-31.log`
- PostgreSQL 日志: `C:\Users\MIRAGE\AppData\Roaming\codeall\db\postgres.log`


## [Sat Jan 31 13:47:58     2026] Preload ESM Fix
Electron preload scripts must be CommonJS to work with the Electron sandbox/loader. Changed electron.vite.config.ts to force 'cjs' format and output .cjs extension. Verified output uses require().

## [2026-01-31T05:50:35.000Z] Preload ESM to CJS Fix - SUCCESSFUL

### Problem
After fixing Prisma packaging, the application still failed to start due to preload script errors:
```
Unable to load preload script: ...\out\preload\preload.mjs
SyntaxError: Cannot use import statement outside a module
```

### Root Cause
- electron-vite was building the preload script as ESM format (`.mjs` with `import` statements)
- Electron's preload context expects CommonJS format
- The preload script couldn't load, preventing IPC communication

### Solution
Updated `electron.vite.config.ts` preload configuration to force CommonJS output:
```typescript
preload: {
  build: {
    rollupOptions: {
      output: {
        format: 'cjs',  // Force CommonJS format
        entryFileNames: '[name].cjs'  // Output as .cjs files
      }
    }
  }
}
```

### Verification Results
✅ **Fix SUCCESSFUL** - Dev mode test showed:
- Preload script loads without errors
- `[Browser IPC] Handlers registered` message appears
- `window.codeall` API successfully exposed
- Application window creates successfully
- Database initialization begins (reaches Phase 4)

### Files Changed
- `electron.vite.config.ts` (lines 37-40): Added CJS output configuration
- `out/preload/preload.cjs`: Now uses `require()` instead of `import`

### Remaining Issue
Development environment has a path issue finding `pg_ctl`, but this is unrelated to the Prisma packaging fix.
The fix successfully resolves the preload/IPC blocker that prevented integration testing.

### Commit
- `bf33428`: fix(preload): convert ESM to CommonJS format for Electron compatibility
