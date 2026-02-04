# CodeAll 设置与备份功能修复计划

## TL;DR

> **Quick Summary**: 修复模型配置无法保存、备份列表加载失败、页面布局混乱三大问题
>
> **Deliverables**:
>
> - 模型配置可正常保存（所有提供商类型）
> - 备份功能完全可用
> - 设置页面有返回按钮和清晰导航
>
> **Estimated Effort**: Short (2-4 hours)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 6

---

## Context

### Original Request

用户报告运行最新版后发现：

1. 无法保存 LLM 配置，无法添加模型
2. 数据管理里显示"加载备份列表失败"
3. 没有返回按钮，页面杂乱不堪

### Research Findings

**问题1：模型配置无法保存**

- **根因A - 验证不匹配**：前端 `ModelConfigForm.tsx` 发送 `'google'`, `'ollama'`, `'custom'`，但后端 `validators.ts` 只接受 `'gemini'`, `'openai-compatible'`
- **根因B - 保存逻辑错误**：`SettingsPage.tsx` 的 `handleSave` 只更新 `models[0]`，空列表时静默失败
- **根因C - 无用户反馈**：错误只记录到 console，用户无法得知操作结果

**问题2：备份列表加载失败**

- **根因**：前端调用 `backup:list`、`backup:create`、`backup:delete`、`restore:from-file` 但主进程完全没有注册这些 IPC 处理器
- `BackupService` 类已完整实现但未连接到 IPC 层
- `src/shared/ipc-channels.ts` 也缺少 backup 通道定义

**问题3：页面布局问题**

- 设置页面没有返回按钮
- 参考 hello-halo 的导航模式：使用 store-based 路由 + Header 组件中的返回按钮

---

## Work Objectives

### Core Objective

修复 CodeAll 的模型配置保存、备份功能和页面导航问题。

### Concrete Deliverables

- `src/main/ipc/validators.ts` - 扩展 provider 枚举
- `src/main/ipc/handlers/backup.ts` - 新增 backup IPC 处理器
- `src/main/ipc/index.ts` - 注册 backup 处理器
- `src/shared/ipc-channels.ts` - 添加 backup 通道定义
- `src/main/preload.ts` - 添加 backup 通道到白名单
- `src/renderer/src/pages/SettingsPage.tsx` - 添加返回按钮和 toast 反馈

### Definition of Done

- [x] 所有 provider 类型可正常保存（anthropic, openai, google, ollama, custom）
- [x] 备份列表正常加载，可创建/删除备份
- [x] 设置页面有清晰的返回按钮
- [x] 操作有成功/失败的 toast 提示

---

## TODOs

- [ ] 1. 修复 Provider 验证枚举

  **What to do**:
  - 编辑 `src/main/ipc/validators.ts`
  - 在 `modelCreateSchema` 和 `modelUpdateSchema` 中添加 `'google'`, `'ollama'`, `'custom'`

  **Code Change**:

  ```typescript
  // OLD:
  provider: z.enum(['anthropic', 'openai', 'gemini', 'openai-compatible'])

  // NEW:
  provider: z.enum([
    'anthropic',
    'openai',
    'gemini',
    'google',
    'ollama',
    'custom',
    'openai-compatible'
  ])
  ```

  **References**:
  - `src/main/ipc/validators.ts:22-28` - modelCreateSchema
  - `src/main/ipc/validators.ts:30-39` - modelUpdateSchema
  - `src/renderer/src/components/ModelConfigForm.tsx:12` - 前端 ModelProvider 类型

  **Acceptance Criteria**:
  - [ ] `pnpm tsc --noEmit` 通过
  - [ ] 前端选择任意 provider 后保存不再报验证错误

  **Commit**: YES
  - Message: `fix(validators): add missing provider types to model schema`

---

- [ ] 2. 添加 Backup IPC 通道定义

  **What to do**:
  - 编辑 `src/shared/ipc-channels.ts`
  - 在 `INVOKE_CHANNELS` 中添加 backup 相关通道

  **Code Change**:

  ```typescript
  // Add to INVOKE_CHANNELS:
  BACKUP_LIST: 'backup:list',
  BACKUP_CREATE: 'backup:create',
  BACKUP_DELETE: 'backup:delete',
  RESTORE_FROM_FILE: 'restore:from-file',
  ```

  **References**:
  - `src/shared/ipc-channels.ts:12-120` - INVOKE_CHANNELS 对象
  - `src/renderer/src/components/settings/DataManagement.tsx:51,81,95,110` - 前端调用的通道

  **Acceptance Criteria**:
  - [ ] `pnpm tsc --noEmit` 通过

  **Commit**: YES (与 Task 3 合并)

---

- [ ] 3. 创建 Backup IPC 处理器

  **What to do**:
  - 创建新文件 `src/main/ipc/handlers/backup.ts`
  - 实现 4 个 IPC 处理器连接到现有 BackupService

  **Code Template**:

  ```typescript
  import { ipcMain } from 'electron'
  import { BackupService } from '../../services/backup.service'

  export function registerBackupHandlers() {
    const backupService = BackupService.getInstance()

    ipcMain.handle('backup:list', async () => {
      return await backupService.listBackups()
    })

    ipcMain.handle('backup:create', async (_, name?: string) => {
      return await backupService.createBackup(name)
    })

    ipcMain.handle('backup:delete', async (_, filename: string) => {
      return await backupService.deleteBackup(filename)
    })

    ipcMain.handle('restore:from-file', async (_, filePath: string) => {
      return await backupService.restoreFromFile(filePath)
    })
  }
  ```

  **References**:
  - `src/main/services/backup.service.ts` - BackupService 实现
  - `src/main/ipc/handlers/model.ts` - 参考现有 handler 模式

  **Acceptance Criteria**:
  - [ ] 文件创建且 TypeScript 编译通过
  - [ ] 所有方法正确调用 BackupService

  **Commit**: YES
  - Message: `feat(ipc): add backup IPC handlers`

---

- [ ] 4. 注册 Backup 处理器并更新 Preload

  **What to do**:
  - 编辑 `src/main/ipc/index.ts`：导入并调用 `registerBackupHandlers()`
  - 编辑 `src/main/preload.ts`：将 backup 通道添加到白名单

  **Code Changes**:

  `src/main/ipc/index.ts`:

  ```typescript
  import { registerBackupHandlers } from './handlers/backup'

  // In registerIPCHandlers():
  registerBackupHandlers()
  ```

  `src/main/preload.ts` (if using manual whitelist):

  ```typescript
  // Add to ALLOWED_CHANNELS array:
  'backup:list',
  'backup:create',
  'backup:delete',
  'restore:from-file',
  ```

  **References**:
  - `src/main/ipc/index.ts:1-20` - 现有 handler 导入
  - `src/main/preload.ts:8-68` - ALLOWED_CHANNELS 数组

  **Acceptance Criteria**:
  - [ ] `pnpm tsc --noEmit` 通过
  - [ ] 备份列表正常加载

  **Commit**: YES
  - Message: `feat(ipc): register backup handlers and update preload whitelist`

---

- [ ] 5. 改进 SettingsPage 布局和反馈

  **What to do**:
  - 编辑 `src/renderer/src/pages/SettingsPage.tsx`
  - 添加返回按钮到页面顶部
  - 添加 toast 状态和显示逻辑
  - 在 handleAdd/handleSave/handleDelete 中显示操作结果

  **Code Changes**:

  添加返回按钮：

  ```tsx
  import { ArrowLeft } from 'lucide-react'
  import { useNavigate } from 'react-router-dom' // 或使用 store 导航

  // 在页面顶部添加：
  ;<div className="flex items-center gap-4 mb-6">
    <button
      onClick={() => navigate(-1)}
      className="flex items-center gap-2 text-slate-400 hover:text-white transition"
    >
      <ArrowLeft className="h-5 w-5" />
      返回
    </button>
    <h1 className="text-2xl font-bold text-white">设置</h1>
  </div>
  ```

  添加 Toast 状态：

  ```tsx
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 在 handleAdd 中：
  try {
    await window.codeall.invoke('model:create', values)
    setToast({ type: 'success', text: '模型添加成功' })
  } catch (error) {
    setToast({ type: 'error', text: '添加失败: ' + (error as Error).message })
  }
  ```

  **References**:
  - `src/renderer/src/pages/SettingsPage.tsx:111-145` - handleAdd/handleSave/handleDelete
  - `/mnt/d/AiWork/hello-halo/src/renderer/pages/SettingsPage.tsx` - 参考布局

  **Acceptance Criteria**:
  - [ ] 页面有清晰的返回按钮
  - [ ] 操作成功/失败有 toast 提示
  - [ ] `pnpm tsc --noEmit` 通过

  **Commit**: YES
  - Message: `feat(ui): add back navigation and toast feedback to settings page`

---

- [ ] 6. 验证所有修复

  **What to do**:
  - 运行 TypeScript 检查
  - 构建并启动应用
  - 手动测试：
    1. 添加一个 Google 模型配置 → 应成功保存
    2. 添加一个 Ollama 模型配置 → 应成功保存
    3. 进入数据管理 → 备份列表应正常加载
    4. 创建一个备份 → 应成功
    5. 点击返回按钮 → 应正确导航

  **Verification Commands**:

  ```bash
  pnpm tsc --noEmit
  pnpm build
  # 启动测试
  ```

  **Acceptance Criteria**:
  - [ ] 所有 provider 类型可保存
  - [ ] 备份列表正常
  - [ ] 返回导航正常

  **Commit**: NO (验证任务)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: 修复 Provider 验证枚举
├── Task 2: 添加 Backup IPC 通道定义
└── Task 3: 创建 Backup IPC 处理器

Wave 2 (After Wave 1):
├── Task 4: 注册处理器并更新 Preload
└── Task 5: 改进 SettingsPage 布局

Wave 3 (Final):
└── Task 6: 验证所有修复
```

---

## Commit Strategy

| After Task | Message                                                             | Files                                   |
| ---------- | ------------------------------------------------------------------- | --------------------------------------- |
| 1          | `fix(validators): add missing provider types to model schema`       | `validators.ts`                         |
| 2-3        | `feat(ipc): add backup IPC handlers`                                | `ipc-channels.ts`, `handlers/backup.ts` |
| 4          | `feat(ipc): register backup handlers and update preload whitelist`  | `index.ts`, `preload.ts`                |
| 5          | `feat(ui): add back navigation and toast feedback to settings page` | `SettingsPage.tsx`                      |

---

## Success Criteria

### Verification Commands

```bash
# 编译检查
pnpm tsc --noEmit
# Expected: Exit code 0

# 构建
pnpm build
# Expected: Success
```

### Final Checklist

- [ ] Google/Ollama/Custom provider 可正常保存
- [ ] 备份列表正常加载
- [ ] 可创建和删除备份
- [ ] 设置页面有返回按钮
- [ ] 操作有 toast 反馈
