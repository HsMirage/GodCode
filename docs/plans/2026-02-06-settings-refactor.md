# 设置页面重构：删除路由规则 + 合并 LLM/API密钥管理

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 删除路由规则功能，将 LLM配置与API密钥合并为单一 Tab，采用树形结构（API密钥 → 模型列表）

**Architecture:**
- 删除路由规则相关的前端组件、后端 handler、IPC 通道
- 创建新的 `ProviderModelPanel` 组件，替代现有的 `ModelConfigForm` 和 `ApiKeyForm`
- 数据模型关系：`ApiKey (1) --- (N) Model`，通过 `apiKeyId` 外键关联

**Tech Stack:** React + TypeScript, Prisma, Electron IPC, Zustand

---

## Phase 1: 删除路由规则功能

### Task 1: 删除路由规则后端代码

**Files:**
- Delete: `src/main/ipc/handlers/router.ts`
- Modify: `src/main/ipc/index.ts:25,87-88`
- Modify: `src/shared/ipc-channels.ts:89-96`
- Modify: `src/main/preload.ts:66-67`

**Step 1: 删除 router handler 文件**

删除文件 `src/main/ipc/handlers/router.ts`

**Step 2: 移除 IPC 注册**

修改 `src/main/ipc/index.ts`，删除：
- 第 25 行的 import: `import { handleRouterGetRules, handleRouterSaveRules } from './handlers/router'`
- 第 87-88 行的 handler 注册:
  ```typescript
  // 删除这两行
  ipcMain.handle('router:get-rules', handleRouterGetRules)
  ipcMain.handle('router:save-rules', handleRouterSaveRules)
  ```

**Step 3: 移除 IPC 通道定义**

修改 `src/shared/ipc-channels.ts`，删除第 89-96 行：
```typescript
// 删除整个 Router Operations 块
// Router Operations
ROUTER_GET_RULES: 'router:get-rules',
ROUTER_SAVE_RULES: 'router:save-rules',
// Note: 'router:set-rules' is present in preload but mapped to 'router:save-rules' logic in main if mismatched.
// We keep 'router:set-rules' here if it's used by frontend, or align with main.
// Based on analysis: preload has 'router:set-rules', main has 'router:save-rules'.
// We include both to reflect current codebase state, but mark distinctness.
ROUTER_SET_RULES: 'router:set-rules',
```

**Step 4: 移除 preload 允许通道**

修改 `src/main/preload.ts`，删除第 66-67 行：
```typescript
// 删除这两行
'router:get-rules',
'router:save-rules',
```

**Step 5: 运行 TypeScript 检查**

Run: `pnpm typecheck`
Expected: PASS (无路由规则相关错误)

**Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: remove routing rules backend code

Delete router handler, IPC registration, and channel definitions.
The routing rules feature conflicts with agent binding configuration.
EOF
)"
```

---

### Task 2: 删除路由规则前端代码

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx`

**Step 1: 移除路由规则相关代码**

修改 `src/renderer/src/pages/SettingsPage.tsx`：

1. 删除类型定义（第 10-30 行）:
```typescript
// 删除 Strategy, RoutingRule, RuleDraft 类型定义
type Strategy = 'delegate' | 'workforce' | 'direct'

interface RoutingRule {
  pattern: RegExp
  strategy: Strategy
  category?: string
  subagent?: string
  model?: string
  baseURL?: string
  apiKey?: string
}

interface RuleDraft {
  pattern: string
  strategy: Strategy
  category: string
  subagent: string
  model: string
  baseURL: string
  apiKey: string
}
```

2. 删除 DEFAULT_RULES 常量（第 32-57 行）

3. 修改 TABS 常量，移除 'rules' 和 'keys' Tab，合并为 'providers':
```typescript
const TABS = [
  { id: 'providers', label: 'API服务商' },
  { id: 'agents', label: '智能体' },
  { id: 'data', label: '数据管理' }
]
```

4. 删除路由规则相关的 state（第 76-99 行）:
```typescript
// 删除这些 state
const [rules, setRules] = useState<RoutingRule[]>(DEFAULT_RULES)
const [dragIndex, setDragIndex] = useState<number | null>(null)
const [editingIndex, setEditingIndex] = useState<number | null>(null)
const [formError, setFormError] = useState<string | null>(null)
const [draft, setDraft] = useState<RuleDraft>({...})
```

5. 删除 fetchRules useEffect（第 118-136 行）

6. 删除所有路由规则相关的函数:
   - `resetDraft` (第 186-210 行)
   - `startAddRule` (第 212-215 行)
   - `startEditRule` (第 217-220 行)
   - `handleRuleDelete` (第 222-230 行)
   - `handleRuleSave` (第 232-264 行)
   - `saveRulesToBackend` (第 266-282 行)
   - `handleRuleDrop` (第 284-295 行)

7. 删除路由规则的 JSX 渲染块（第 379-613 行）

8. 更新 activeTab 类型:
```typescript
const [activeTab, setActiveTab] = useState<'providers' | 'agents' | 'data'>('providers')
```

**Step 2: 临时保留 API密钥 和 LLM配置 Tab 渲染（后续 Task 会替换）**

暂时将 'llm' 和 'keys' Tab 的内容移到 'providers' Tab 下:
```tsx
{activeTab === 'providers' ? (
  <div className={`${panelClass} p-6`}>
    <div className="mb-6">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Provider Studio</p>
      <h2 className="mt-2 text-xl font-semibold text-white">API服务商</h2>
    </div>
    <ApiKeyForm />
  </div>
) : null}
```

**Step 3: 运行 TypeScript 检查**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: 运行开发服务器验证**

Run: `pnpm dev`
Expected: 应用启动，设置页面显示三个 Tab: API服务商、智能体、数据管理

**Step 5: Commit**

```bash
git add src/renderer/src/pages/SettingsPage.tsx
git commit -m "$(cat <<'EOF'
refactor: remove routing rules from settings UI

Remove routing rules tab and all related state/handlers.
Consolidate LLM and API key tabs into single 'providers' tab.
EOF
)"
```

---

## Phase 2: 重构数据模型

### Task 3: 修改 Prisma Schema 添加 Model-ApiKey 关联

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: 在 Model 表添加 apiKeyId 外键**

修改 `prisma/schema.prisma` 中的 Model 模型:

```prisma
// Model表
model Model {
  id               String            @id @default(uuid())
  provider         String
  modelName        String
  apiKeyId         String?           // 新增：关联到 ApiKey
  apiKeyRef        ApiKey?           @relation(fields: [apiKeyId], references: [id], onDelete: SetNull)
  apiKey           String?           // 保留：向后兼容，将逐步废弃
  baseURL          String?           // 保留：向后兼容，将逐步废弃
  contextSize      Int               @default(32)
  config           Json              @default("{}")
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  agentBindings    AgentBinding[]
  categoryBindings CategoryBinding[]

  @@index([provider, modelName])
  @@index([apiKeyId])
}
```

**Step 2: 在 ApiKey 表添加反向关联**

```prisma
// ApiKey表
model ApiKey {
  id            String   @id @default(uuid())
  provider      String
  label         String?
  baseURL       String
  encryptedKey  String   @db.Text
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  models        Model[]  // 新增：反向关联

  @@index([provider])
}
```

**Step 3: 生成 Prisma Client**

Run: `pnpm prisma generate`
Expected: PASS

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat(schema): add Model-ApiKey relationship

Add apiKeyId foreign key to Model table for proper association.
One ApiKey can have multiple Models attached.
EOF
)"
```

---

### Task 4: 创建数据库迁移

**Files:**
- Create: Migration file (auto-generated)

**Step 1: 创建迁移**

Run: `pnpm prisma migrate dev --name add_model_apikey_relation`
Expected: Migration created and applied

**Step 2: Commit**

```bash
git add prisma/migrations/
git commit -m "$(cat <<'EOF'
chore(db): add migration for Model-ApiKey relation
EOF
)"
```

---

## Phase 3: 更新后端服务

### Task 5: 更新 Model Handler 支持 apiKeyId

**Files:**
- Modify: `src/main/ipc/handlers/model.ts`

**Step 1: 更新 handleModelCreate**

修改 `src/main/ipc/handlers/model.ts`:

```typescript
export async function handleModelCreate(
  _event: IpcMainInvokeEvent,
  input: ModelCreateInput
): Promise<PrismaModel> {
  const validation = modelCreateSchema.safeParse(input)
  if (!validation.success) {
    throw new Error(`Validation failed: ${validation.error.message}`)
  }

  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const createdRecord = await prisma.model.create({
    data: {
      provider: input.provider,
      modelName: input.modelName,
      apiKeyId: input.apiKeyId || null, // 新增
      contextSize: input.contextSize || 32,
      config: input.config
    }
  })

  return createdRecord
}
```

**Step 2: 更新 handleModelList 包含 ApiKey 关联**

```typescript
export async function handleModelList(_event: IpcMainInvokeEvent): Promise<any[]> {
  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const models = await prisma.model.findMany({
    include: {
      apiKeyRef: {
        select: {
          id: true,
          label: true,
          baseURL: true,
          provider: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return models
}
```

**Step 3: 更新 handleModelUpdate**

```typescript
export async function handleModelUpdate(
  _event: IpcMainInvokeEvent,
  input: ModelUpdateInput
): Promise<PrismaModel> {
  const validation = modelUpdateSchema.safeParse(input)
  if (!validation.success) {
    throw new Error(`Validation failed: ${validation.error.message}`)
  }

  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()
  const { id, data } = input

  const updateData: Prisma.ModelUpdateInput = {
    modelName: data.modelName,
    provider: data.provider,
    apiKeyId: data.apiKeyId,
    contextSize: data.contextSize,
    config: data.config ?? undefined
  }

  const updatedRecord = await prisma.model.update({
    where: { id },
    data: updateData
  })

  return updatedRecord
}
```

**Step 4: 运行 TypeScript 检查**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/handlers/model.ts
git commit -m "$(cat <<'EOF'
feat(api): update model handlers for apiKeyId relation

- handleModelCreate now accepts apiKeyId
- handleModelList includes apiKeyRef relation
- handleModelUpdate supports apiKeyId updates
EOF
)"
```

---

### Task 6: 添加获取 ApiKey 下所有 Model 的 Handler

**Files:**
- Modify: `src/main/ipc/handlers/keychain.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/preload.ts`

**Step 1: 添加 handleKeychainGetWithModels**

在 `src/main/ipc/handlers/keychain.ts` 添加:

```typescript
export const handleKeychainGetWithModels = async (
  _: IpcMainInvokeEvent,
  apiKeyId: string
): Promise<any> => {
  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()
  const secureStorage = SecureStorageService.getInstance()

  const apiKey = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    include: {
      models: {
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  if (!apiKey) return null

  return {
    id: apiKey.id,
    label: apiKey.label,
    baseURL: apiKey.baseURL,
    provider: apiKey.provider,
    apiKey: secureStorage.decrypt(apiKey.encryptedKey),
    models: apiKey.models
  }
}

export const handleKeychainListWithModels = async (): Promise<Array<any>> => {
  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()
  const secureStorage = SecureStorageService.getInstance()

  const records = await prisma.apiKey.findMany({
    include: {
      models: {
        orderBy: { createdAt: 'desc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return records.map(record => ({
    id: record.id,
    label: record.label,
    baseURL: record.baseURL,
    provider: record.provider,
    apiKey: secureStorage.decrypt(record.encryptedKey),
    models: record.models
  }))
}
```

**Step 2: 注册新 Handler**

在 `src/main/ipc/index.ts` 添加:

```typescript
import {
  handleKeychainDeletePassword,
  handleKeychainGetPassword,
  handleKeychainSetPassword,
  handleKeychainList,
  handleKeychainGetWithModels,    // 新增
  handleKeychainListWithModels    // 新增
} from './handlers/keychain'

// 在 registerIpcHandlers 函数中添加
ipcMain.handle('keychain:get-with-models', handleKeychainGetWithModels)
ipcMain.handle('keychain:list-with-models', handleKeychainListWithModels)
```

**Step 3: 添加 IPC 通道定义**

在 `src/shared/ipc-channels.ts` INVOKE_CHANNELS 中添加:

```typescript
// Keychain Operations
KEYCHAIN_SET_PASSWORD: 'keychain:set-password',
KEYCHAIN_GET_PASSWORD: 'keychain:get-password',
KEYCHAIN_DELETE_PASSWORD: 'keychain:delete-password',
KEYCHAIN_GET_WITH_MODELS: 'keychain:get-with-models',      // 新增
KEYCHAIN_LIST_WITH_MODELS: 'keychain:list-with-models',    // 新增
```

**Step 4: 添加 preload 允许通道**

在 `src/main/preload.ts` ALLOWED_CHANNELS 中添加:

```typescript
'keychain:get-with-models',
'keychain:list-with-models',
```

**Step 5: 运行 TypeScript 检查**

Run: `pnpm typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/main/ipc/handlers/keychain.ts src/main/ipc/index.ts src/shared/ipc-channels.ts src/main/preload.ts
git commit -m "$(cat <<'EOF'
feat(api): add keychain handlers with model relations

- handleKeychainGetWithModels: get single API key with its models
- handleKeychainListWithModels: list all API keys with their models
EOF
)"
```

---

## Phase 4: 创建新的前端组件

### Task 7: 创建 ProviderModelPanel 组件

**Files:**
- Create: `src/renderer/src/components/settings/ProviderModelPanel.tsx`

**Step 1: 创建组件文件**

创建 `src/renderer/src/components/settings/ProviderModelPanel.tsx`:

```tsx
/**
 * API服务商与模型管理面板
 * 树形结构：API密钥 → 模型列表
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Key,
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit2,
  Save,
  X,
  Bot,
  Globe,
  Eye,
  EyeOff
} from 'lucide-react'

interface ModelData {
  id: string
  modelName: string
  provider: string
  contextSize: number
  apiKeyId: string | null
}

interface ProviderData {
  id: string
  label: string | null
  baseURL: string
  apiKey: string
  provider: string
  models: ModelData[]
}

const panelClass = [
  'rounded-xl border border-slate-800/70',
  'bg-slate-900/50 p-4',
  'transition-all hover:border-slate-700'
].join(' ')

const inputClass = [
  'w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2',
  'text-sm text-slate-100 placeholder:text-slate-500',
  'focus:border-sky-500/60 focus:outline-none focus:ring-1 focus:ring-sky-500/20'
].join(' ')

const buttonPrimary = [
  'flex items-center gap-2 rounded-lg px-3 py-1.5',
  'bg-sky-600 text-xs font-medium text-white',
  'hover:bg-sky-500 transition-colors'
].join(' ')

const buttonSecondary = [
  'flex items-center gap-2 rounded-lg px-3 py-1.5',
  'border border-slate-700 text-xs text-slate-300',
  'hover:bg-slate-800 transition-colors'
].join(' ')

const buttonDanger = [
  'flex items-center gap-1.5 rounded-lg px-2 py-1',
  'border border-rose-800/50 text-xs text-rose-300',
  'hover:bg-rose-950/50 transition-colors'
].join(' ')

export function ProviderModelPanel() {
  const [providers, setProviders] = useState<ProviderData[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})

  // Provider form state
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [providerForm, setProviderForm] = useState({
    label: '',
    baseURL: '',
    apiKey: ''
  })

  // Model form state
  const [addingModelToId, setAddingModelToId] = useState<string | null>(null)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [modelForm, setModelForm] = useState({
    modelName: '',
    contextSize: 32
  })

  const loadProviders = useCallback(async () => {
    if (!window.codeall) {
      setLoading(false)
      return
    }

    try {
      const data = (await window.codeall.invoke('keychain:list-with-models')) as ProviderData[]
      setProviders(data)
    } catch (error) {
      console.error('Failed to load providers:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // Provider CRUD
  const resetProviderForm = () => {
    setProviderForm({ label: '', baseURL: '', apiKey: '' })
    setEditingProviderId(null)
    setShowProviderForm(false)
  }

  const startEditProvider = (provider: ProviderData) => {
    setProviderForm({
      label: provider.label || '',
      baseURL: provider.baseURL,
      apiKey: provider.apiKey
    })
    setEditingProviderId(provider.id)
    setShowProviderForm(true)
  }

  const handleSaveProvider = async () => {
    if (!window.codeall || !providerForm.baseURL || !providerForm.apiKey) return

    try {
      await window.codeall.invoke('keychain:set-password', {
        id: editingProviderId || undefined,
        label: providerForm.label || undefined,
        baseURL: providerForm.baseURL,
        apiKey: providerForm.apiKey,
        provider: 'custom'
      })
      await loadProviders()
      resetProviderForm()
    } catch (error) {
      console.error('Failed to save provider:', error)
    }
  }

  const handleDeleteProvider = async (id: string) => {
    if (!window.codeall) return
    if (!confirm('删除此 API 服务商将同时删除其下所有模型配置，确认删除？')) return

    try {
      await window.codeall.invoke('keychain:delete-password', {
        service: 'codeall-app',
        account: 'ignored',
        id
      })
      await loadProviders()
    } catch (error) {
      console.error('Failed to delete provider:', error)
    }
  }

  // Model CRUD
  const resetModelForm = () => {
    setModelForm({ modelName: '', contextSize: 32 })
    setAddingModelToId(null)
    setEditingModelId(null)
  }

  const startAddModel = (providerId: string) => {
    setAddingModelToId(providerId)
    setEditingModelId(null)
    setModelForm({ modelName: '', contextSize: 32 })
    // Auto expand
    setExpandedIds((prev) => new Set([...prev, providerId]))
  }

  const startEditModel = (model: ModelData) => {
    setEditingModelId(model.id)
    setAddingModelToId(null)
    setModelForm({
      modelName: model.modelName,
      contextSize: model.contextSize
    })
  }

  const handleSaveModel = async (apiKeyId: string) => {
    if (!window.codeall || !modelForm.modelName) return

    try {
      if (editingModelId) {
        await window.codeall.invoke('model:update', {
          id: editingModelId,
          data: {
            modelName: modelForm.modelName,
            contextSize: modelForm.contextSize,
            apiKeyId
          }
        })
      } else {
        await window.codeall.invoke('model:create', {
          provider: 'openai-compatible',
          modelName: modelForm.modelName,
          contextSize: modelForm.contextSize,
          apiKeyId
        })
      }
      await loadProviders()
      resetModelForm()
    } catch (error) {
      console.error('Failed to save model:', error)
    }
  }

  const handleDeleteModel = async (modelId: string) => {
    if (!window.codeall) return
    if (!confirm('确认删除此模型配置？')) return

    try {
      await window.codeall.invoke('model:delete', modelId)
      await loadProviders()
    } catch (error) {
      console.error('Failed to delete model:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500 text-sm">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          管理 API 服务商和对应的模型配置
        </p>
        <button
          type="button"
          onClick={() => {
            resetProviderForm()
            setShowProviderForm(true)
          }}
          disabled={showProviderForm}
          className={buttonPrimary}
        >
          <Plus className="w-3.5 h-3.5" />
          添加服务商
        </button>
      </div>

      {/* Provider Form */}
      {showProviderForm && (
        <div className="rounded-xl border border-sky-500/30 bg-slate-900/80 p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">
              {editingProviderId ? '编辑服务商' : '添加服务商'}
            </h3>
            <button type="button" onClick={resetProviderForm} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">名称 (可选)</label>
              <input
                type="text"
                value={providerForm.label}
                onChange={(e) => setProviderForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="My OpenAI"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-sky-400">Base URL *</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={providerForm.baseURL}
                  onChange={(e) => setProviderForm((p) => ({ ...p, baseURL: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-sky-400">API Key *</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={providerForm.apiKey}
                onChange={(e) => setProviderForm((p) => ({ ...p, apiKey: e.target.value }))}
                placeholder="sk-..."
                className={`${inputClass} pl-10 font-mono`}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={resetProviderForm} className={buttonSecondary}>
              取消
            </button>
            <button
              type="button"
              onClick={handleSaveProvider}
              disabled={!providerForm.baseURL || !providerForm.apiKey}
              className={buttonPrimary}
            >
              <Save className="w-3.5 h-3.5" />
              保存
            </button>
          </div>
        </div>
      )}

      {/* Provider List */}
      {providers.length === 0 && !showProviderForm && (
        <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
          暂无 API 服务商配置
        </div>
      )}

      {providers.map((provider) => (
        <div key={provider.id} className={panelClass}>
          {/* Provider Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleExpand(provider.id)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                {expandedIds.has(provider.id) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>

              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700/50">
                <span className="font-bold text-slate-400 text-xs uppercase">
                  {(provider.label || 'API').slice(0, 2)}
                </span>
              </div>

              <div>
                <h4 className="font-medium text-slate-200">
                  {provider.label || 'Unnamed Provider'}
                </h4>
                <p className="text-xs text-slate-500 font-mono truncate max-w-[300px]">
                  {provider.baseURL}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 mr-4">
                <input
                  type={visibleKeys[provider.id] ? 'text' : 'password'}
                  value={provider.apiKey}
                  readOnly
                  className="bg-transparent border-none p-0 text-xs text-slate-500 font-mono w-20 focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => toggleKeyVisibility(provider.id)}
                  className="text-slate-600 hover:text-slate-400 transition-colors"
                >
                  {visibleKeys[provider.id] ? (
                    <EyeOff className="w-3 h-3" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                </button>
              </div>

              <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded">
                {provider.models.length} 个模型
              </span>

              <button
                type="button"
                onClick={() => startAddModel(provider.id)}
                className={buttonSecondary}
              >
                <Plus className="w-3 h-3" />
                添加模型
              </button>

              <button
                type="button"
                onClick={() => startEditProvider(provider)}
                className={buttonSecondary}
              >
                <Edit2 className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={() => handleDeleteProvider(provider.id)}
                className={buttonDanger}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Models List */}
          {expandedIds.has(provider.id) && (
            <div className="mt-4 ml-7 space-y-2">
              {/* Add Model Form */}
              {addingModelToId === provider.id && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-sky-500/30 bg-slate-950/50">
                  <Bot className="w-4 h-4 text-sky-400" />
                  <input
                    type="text"
                    value={modelForm.modelName}
                    onChange={(e) => setModelForm((m) => ({ ...m, modelName: e.target.value }))}
                    placeholder="模型名称，如 gpt-4o"
                    className={`${inputClass} flex-1`}
                  />
                  <input
                    type="number"
                    value={modelForm.contextSize}
                    onChange={(e) =>
                      setModelForm((m) => ({ ...m, contextSize: parseInt(e.target.value) || 32 }))
                    }
                    placeholder="上下文(K)"
                    className={`${inputClass} w-24`}
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveModel(provider.id)}
                    disabled={!modelForm.modelName}
                    className={buttonPrimary}
                  >
                    <Save className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={resetModelForm} className={buttonSecondary}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Model Items */}
              {provider.models.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-950/30 border border-slate-800/50 hover:border-slate-700/50 transition-colors"
                >
                  {editingModelId === model.id ? (
                    <>
                      <div className="flex items-center gap-3 flex-1">
                        <Bot className="w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={modelForm.modelName}
                          onChange={(e) =>
                            setModelForm((m) => ({ ...m, modelName: e.target.value }))
                          }
                          className={`${inputClass} flex-1`}
                        />
                        <input
                          type="number"
                          value={modelForm.contextSize}
                          onChange={(e) =>
                            setModelForm((m) => ({
                              ...m,
                              contextSize: parseInt(e.target.value) || 32
                            }))
                          }
                          className={`${inputClass} w-24`}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveModel(provider.id)}
                          className={buttonPrimary}
                        >
                          <Save className="w-3 h-3" />
                        </button>
                        <button type="button" onClick={resetModelForm} className={buttonSecondary}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <Bot className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-200 font-mono">{model.modelName}</span>
                        <span className="text-xs text-slate-500">{model.contextSize}K</span>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startEditModel(model)}
                          className={buttonSecondary}
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteModel(model.id)}
                          className={buttonDanger}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {provider.models.length === 0 && addingModelToId !== provider.id && (
                <div className="text-center py-4 text-slate-600 text-xs border border-dashed border-slate-800/50 rounded-lg">
                  暂无模型配置，点击"添加模型"开始
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

**Step 2: 运行 TypeScript 检查**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/components/settings/ProviderModelPanel.tsx
git commit -m "$(cat <<'EOF'
feat(ui): create ProviderModelPanel component

Tree-structure UI for managing API providers and their models.
Supports CRUD operations for both providers and models.
EOF
)"
```

---

### Task 8: 集成 ProviderModelPanel 到设置页面

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx`

**Step 1: 更新 SettingsPage**

修改 `src/renderer/src/pages/SettingsPage.tsx`:

1. 添加 import:
```typescript
import { ProviderModelPanel } from '../components/settings/ProviderModelPanel'
```

2. 移除不再需要的 import:
```typescript
// 删除这些
import { ApiKeyForm } from '../components/settings/ApiKeyForm'
import { ModelConfigForm, ModelConfigFormValues } from '../components/ModelConfigForm'
```

3. 移除不再需要的 state 和函数:
```typescript
// 删除 models, loadModels 相关代码
// 删除 handleAdd, handleSave, handleDelete 函数
```

4. 更新 'providers' Tab 渲染:
```tsx
{activeTab === 'providers' ? (
  <div className={`${panelClass} p-6`}>
    <div className="mb-6">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Provider Studio</p>
      <h2 className="mt-2 text-xl font-semibold text-white">API服务商</h2>
    </div>
    <ProviderModelPanel />
  </div>
) : null}
```

**Step 2: 完整的精简后 SettingsPage**

```tsx
import { useEffect, useState } from 'react'
import { AgentBindingPanel } from '../components/settings/AgentBindingPanel'
import { DataManagement } from '../components/settings/DataManagement'
import { ProviderModelPanel } from '../components/settings/ProviderModelPanel'
import { Check, AlertTriangle } from 'lucide-react'

const panelClass = [
  'rounded-2xl border border-slate-800/70',
  'bg-slate-950/70 backdrop-blur',
  'shadow-[0_0_24px_rgba(15,23,42,0.35)]'
].join(' ')

const TABS = [
  { id: 'providers', label: 'API服务商' },
  { id: 'agents', label: '智能体' },
  { id: 'data', label: '数据管理' }
]

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'providers' | 'agents' | 'data'>('providers')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
    return
  }, [toast])

  return (
    <div className="px-6 py-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-white">设置</h1>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={[
            'flex items-center gap-2 rounded-xl px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2',
            toast.type === 'success'
              ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border border-rose-500/20 bg-rose-500/10 text-rose-400'
          ].join(' ')}
        >
          {toast.type === 'success' ? (
            <Check className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {toast.text}
        </div>
      )}

      <div className={`${panelClass} p-2`}>
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as 'providers' | 'agents' | 'data')}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold transition',
                'border border-transparent',
                tab.id === activeTab
                  ? 'bg-slate-900/80 text-white shadow-[0_10px_30px_rgba(15,23,42,0.45)]'
                  : 'text-slate-300 hover:border-slate-700/70 hover:text-white'
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'providers' ? (
        <div className={`${panelClass} p-6`}>
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Provider Studio</p>
            <h2 className="mt-2 text-xl font-semibold text-white">API服务商</h2>
          </div>
          <ProviderModelPanel />
        </div>
      ) : null}

      {activeTab === 'agents' ? (
        <div className={`${panelClass} p-6`}>
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Agent Studio</p>
            <h2 className="mt-2 text-xl font-semibold text-white">智能体配置</h2>
          </div>
          <AgentBindingPanel />
        </div>
      ) : null}

      {activeTab === 'data' ? <DataManagement /> : null}
    </div>
  )
}
```

**Step 3: 运行 TypeScript 检查**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: 运行开发服务器验证**

Run: `pnpm dev`
Expected:
- 设置页面显示三个 Tab: API服务商、智能体、数据管理
- API服务商 Tab 显示树形结构的服务商和模型列表
- 可以正常添加/编辑/删除服务商和模型

**Step 5: Commit**

```bash
git add src/renderer/src/pages/SettingsPage.tsx
git commit -m "$(cat <<'EOF'
feat(ui): integrate ProviderModelPanel into settings

Replace separate LLM and API key tabs with unified provider panel.
Settings now has 3 tabs: API服务商, 智能体, 数据管理
EOF
)"
```

---

## Phase 5: 清理与测试

### Task 9: 删除废弃的组件文件

**Files:**
- Delete: `src/renderer/src/components/ModelConfigForm.tsx`
- Delete: `src/renderer/src/components/settings/ModelConfig.tsx`
- Delete: `src/renderer/src/components/settings/ApiKeyForm.tsx`

**Step 1: 确认组件不再被引用**

Run: `pnpm typecheck`
Expected: PASS (如果有引用会报错)

**Step 2: 删除废弃文件**

删除以下文件:
- `src/renderer/src/components/ModelConfigForm.tsx`
- `src/renderer/src/components/settings/ModelConfig.tsx`
- `src/renderer/src/components/settings/ApiKeyForm.tsx`

**Step 3: 再次运行 TypeScript 检查**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: remove deprecated model and API key components

These are replaced by the unified ProviderModelPanel.
EOF
)"
```

---

### Task 10: 删除路由规则相关的后端服务文件（可选清理）

**Files:**
- Delete: `src/main/services/router/smart-router.ts` (保留，仍被其他地方使用)
- Delete: `src/main/services/router/index.ts` (检查是否可删除)

**Step 1: 检查 smart-router 的使用情况**

Run: `grep -r "SmartRouter" src/`

如果仍被使用，保留该文件。SmartRouter 中的路由逻辑可以保留用于后端自动任务分配，只是前端配置入口被移除了。

**Step 2: Commit (如果有删除)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: cleanup unused router service files
EOF
)"
```

---

### Task 11: 端到端测试

**Files:**
- None (测试验证)

**Step 1: 启动应用**

Run: `pnpm dev`

**Step 2: 验证功能**

手动测试以下场景:
1. 设置页面只有三个 Tab: API服务商、智能体、数据管理
2. 添加新的 API 服务商（输入 label、baseURL、apiKey）
3. 在服务商下添加模型（输入 modelName、contextSize）
4. 编辑服务商信息
5. 编辑模型信息
6. 删除模型
7. 删除服务商（确认同时删除其下模型）
8. 智能体配置 Tab 正常工作
9. 数据管理 Tab 正常工作

**Step 3: 运行单元测试**

Run: `pnpm test`
Expected: PASS

**Step 4: Final Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: complete settings page refactor

- Remove routing rules feature (conflicts with agent binding)
- Merge LLM config and API key management into unified provider panel
- Tree structure UI: API Provider -> Models
- Simplify settings to 3 tabs: API服务商, 智能体, 数据管理
EOF
)"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-2 | 删除路由规则（后端 + 前端） |
| 2 | 3-4 | 修改数据模型，添加 Model-ApiKey 关联 |
| 3 | 5-6 | 更新后端 Handler 支持新关联 |
| 4 | 7-8 | 创建并集成 ProviderModelPanel 组件 |
| 5 | 9-11 | 清理废弃代码，端到端测试 |

**预计总工时:** 2-3 小时
**风险点:**
- 数据库迁移需要确保不丢失现有数据
- 现有 Model 记录需要迁移关联到正确的 ApiKey
