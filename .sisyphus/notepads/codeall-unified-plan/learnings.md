## Phase 3: 工具调用系统 (Week 4) - 发现时间: 2026-01-31

### 已实现功能

#### 3.1 基础工具架构 ✅

**文件位置**: `src/main/services/tools/`

- **Tool 抽象接口**: `tool.interface.ts`
  - 定义了 `ToolDefinition` (元数据) 和 `Tool` (执行接口)
  - 规范了输入参数类型 (`ToolParameter`) 和执行上下文 (`ToolExecutionContext`)
  - 统一了执行结果格式 (`ToolExecutionResult`)

- **工具注册中心**: `tool-registry.ts`
  - 单例 `ToolRegistry`
  - 支持按名称获取工具
  - 支持列出所有工具或按类别筛选

- **权限策略系统**: `permission-policy.ts`
  - 黑白名单机制 (`allowList`, `denyList`)
  - 默认策略: 如果白名单为空，则默认允许所有非黑名单工具

- **工具执行器**: `tool-executor.ts`
  - 统一执行入口 `execute(toolName, params, context)`
  - 集成权限检查、工具查找、参数验证
  - 统一错误处理和日志记录

#### 3.2 内置文件工具 ✅

**文件位置**: `src/main/services/tools/builtin/`

- **file_read**: 读取文件内容
  - 安全检查: 防止路径穿越 (必须在 workspace 内)
  - 返回文件内容和元数据 (size)

- **file_write**: 写入文件内容
  - 自动创建父目录
  - 安全检查: 防止路径穿越
  - 覆盖写入模式

- **file_list**: 列出目录内容
  - 支持指定相对路径 (默认为 '.')
  - 返回文件/目录列表和类型信息
  - 安全检查: 防止路径穿越

### 验证结果

- `pnpm typecheck` ✅
- 代码符合 ESLint 规范 (无明显报错)
- 实现了安全路径检查 (path traversal prevention)

## Phase 3: 对话记忆与工具调用 (完成时间: 2026-01-31)

### 工具调用系统 ✅

**文件位置**: `src/main/services/tools/`

#### 核心架构

1. **Tool 接口定义** (`tool.interface.ts`)
   - `ToolParameter`: 参数定义（name, type, description, required, default）
   - `ToolDefinition`: 工具元数据
   - `ToolExecutionContext`: 执行上下文（workspaceDir, sessionId, userId）
   - `ToolExecutionResult`: 执行结果（success, output, error, metadata）
   - `Tool`: 核心接口（definition + execute 方法）

2. **工具注册器** (`tool-registry.ts`)
   - `ToolRegistry` 类：管理工具注册
   - `register(tool)`: 注册工具
   - `get(name)`: 按名称查找
   - `list()`: 列出所有工具
   - `listByCategory(category)`: 按类别筛选
   - 单例: `toolRegistry`

3. **权限策略** (`permission-policy.ts`)
   - `PermissionPolicy` 类：黑白名单控制
   - `allow(toolName)`: 添加到白名单
   - `deny(toolName)`: 添加到黑名单
   - `isAllowed(toolName)`: 检查权限
   - 默认策略: `defaultPolicy` (空白名单=全部允许)

4. **工具执行器** (`tool-executor.ts`)
   - `ToolExecutor` 类：统一执行入口
   - 集成功能:
     - 权限检查
     - 工具查找
     - 参数验证
     - 异常处理
     - 日志记录
   - 单例: `toolExecutor`

#### 内置工具 (`builtin/`)

1. **file-read.ts** - 文件读取
   - 参数: `path` (相对于 workspace)
   - 安全: 路径穿越防护
   - 返回: 文件内容 + metadata (path, size)

2. **file-write.ts** - 文件写入
   - 参数: `path`, `content`
   - 安全: 路径穿越防护
   - 功能: 自动创建目录
   - 返回: 成功消息 + metadata (path, size)

3. **file-list.ts** - 目录列表
   - 参数: `path` (默认 '.')
   - 安全: 路径穿越防护
   - 返回: JSON 格式的文件列表 (name, type)

#### 自动注册机制

在 `index.ts` 中，导入时自动注册三个内置工具：

```typescript
import { toolRegistry } from './tool-registry'
import { fileReadTool } from './builtin/file-read'
import { fileWriteTool } from './builtin/file-write'
import { fileListTool } from './builtin/file-list'

toolRegistry.register(fileReadTool)
toolRegistry.register(fileWriteTool)
toolRegistry.register(fileListTool)
```

#### 安全特性

1. **路径穿越防护**:

   ```typescript
   const filePath = path.resolve(context.workspaceDir, params.path)
   if (!filePath.startsWith(context.workspaceDir)) {
     return { success: false, error: 'Access denied: path outside workspace' }
   }
   ```

2. **参数验证**:
   - 检查必需参数是否存在
   - 类型信息在 ToolParameter 中定义

3. **权限控制**:
   - 黑白名单机制
   - 默认全部允许，可配置

4. **错误处理**:
   - 所有异常捕获并转换为 ToolExecutionResult
   - 详细的错误消息返回

#### 使用示例

```typescript
import { toolExecutor } from '@/main/services/tools'

const result = await toolExecutor.execute(
  'file_read',
  { path: 'README.md' },
  { workspaceDir: '/path/to/workspace', sessionId: 'sess-123' }
)

if (result.success) {
  console.log(result.output) // 文件内容
} else {
  console.error(result.error) // 错误消息
}
```

#### 扩展性

添加新工具的步骤：

1. 创建实现 `Tool` 接口的对象
2. 在 `builtin/` 或其他目录定义工具
3. 在 `index.ts` 中注册工具

工具类别：

- `file`: 文件操作
- `terminal`: 终端命令（未实现）
- `browser`: 浏览器自动化（未实现）
- `system`: 系统信息（未实现）

### 验证结果

- ✅ TypeScript 编译通过
- ✅ 所有接口定义清晰
- ✅ 安全机制完善
- ✅ 代码风格一致

## Phase 3: 项目管理功能 (Week 4) - 发现时间: 2026-01-31

### 文件树浏览服务 (FileTreeService) ✅

- 使用 chokidar 实现目录监听
- 提供 getTree 递归获取目录结构
- 支持文件/目录过滤（忽略隐藏文件和 node_modules）
- 事件驱动的文件变化通知 (add, change, unlink)
- 安全性: 集成 PathValidator 防止路径穿越

### Git 集成服务 (GitService) ✅

- 基于 simple-git 封装
- 提供 status 查询（分支、落后/领先、文件状态）
- 提供 diff 查看（支持全库 diff 和单文件 diff）
- 提供 log 历史查询
- 多实例管理（按工作目录缓存 git 实例）

### 路径安全校验 (PathValidator) ✅

- 集中管理路径安全逻辑
- isPathSafe: 检查是否逃逸出根目录
- resolveSafePath: 安全解析路径，违规抛出异常
- normalizePath: 统一跨平台路径分隔符

### 依赖库

- chokidar: ^5.0.0
- simple-git: ^3.30.0

## Phase 4: 项目管理与提示词系统 (完成时间: 2026-01-31)

### 4.1 工作区与项目管理 ✅

#### Workspace/Space 服务 (已存在)

**文件位置**: `src/main/services/space.service.ts`

**功能**:

- `createSpace(input)`: 创建工作区，自动创建 `.codeall/artifacts` 和 `.codeall/downloads` 目录
- `listSpaces()`: 列出所有工作区
- `getSpace(spaceId)`: 获取单个工作区
- `deleteSpace(spaceId)`: 删除工作区
- `updateSpace(spaceId, updates)`: 更新工作区信息

**IPC 集成**: `src/main/ipc/handlers/space.ts`

- `space:create`, `space:list`, `space:get`, `space:delete`, `space:update`

#### 文件树浏览服务 (新增)

**文件位置**: `src/main/services/file-tree.service.ts`

**核心功能**:

1. **目录树获取** (`getTree`)
   - 递归读取目录结构
   - 返回 FileTreeNode (name, path, type, size, children)
   - 自动跳过隐藏文件和 node_modules

2. **文件监听** (`watchDirectory`)
   - 使用 chokidar 监听文件变化
   - 支持的事件: add, change, unlink, addDir, unlinkDir
   - EventEmitter 模式推送变化
   - 支持多个 watcher 实例（按 watchId 管理）

3. **资源管理**
   - `unwatchDirectory(watchId)`: 停止单个监听
   - `closeAll()`: 停止所有监听

**安全特性**:

- 集成 PathValidator 防止路径穿越
- 自动忽略隐藏文件 (`/(^|[\/\\])\.../`)
- 深度限制: 10 层

**单例模式**: `fileTreeService`

#### Git 集成服务 (新增)

**文件位置**: `src/main/services/git.service.ts`

**核心功能**:

1. **仓库检测** (`isGitRepo`)
   - 检查目录是否是 Git 仓库

2. **状态查询** (`status`)
   - 返回当前分支、ahead/behind 数量
   - 列出所有变更文件（modified, created, deleted, staged）

3. **Diff 查看** (`diff`)
   - 支持全仓库 diff 或单文件 diff
   - 路径安全校验

4. **提交历史** (`log`)
   - 获取最近 N 条提交记录
   - 默认 10 条

**实例管理**:

- 多实例缓存（按 workDir 缓存）
- `clearCache(workDir?)`: 清理缓存

**单例模式**: `gitService`

**依赖**: `simple-git` v3.30.0

#### 路径安全校验工具 (新增)

**文件位置**: `src/shared/path-validator.ts`

**核心方法**:

```typescript
PathValidator.isPathSafe(targetPath, rootDir): boolean
PathValidator.resolveSafePath(targetPath, rootDir): string
PathValidator.normalizePath(inputPath): string
```

**安全机制**:

1. **路径穿越防护**
   - 确保解析后的路径在 rootDir 内
   - 使用 `path.resolve()` 规范化路径
   - `startsWith()` 检查前缀

2. **错误处理**
   - 不安全路径抛出 `Error: Path traversal detected`

**使用场景**:

- 所有文件操作工具
- 文件树服务
- Git 服务

### 依赖管理

**新增依赖**:

- `chokidar` ^5.0.0 - 文件监听
- `simple-git` ^3.30.0 - Git 操作
- `@types/chokidar` ^2.1.7 - 类型定义

### 验证结果

- ✅ 所有文件已创建
- ✅ TypeScript 编译通过
- ✅ 依赖正确安装
- ✅ 路径安全机制完善

### 架构亮点

1. **EventEmitter 模式**: 文件树服务使用事件推送，支持实时 UI 更新
2. **单例模式**: 所有服务导出单例，避免重复实例化
3. **缓存优化**: Git 服务缓存实例，减少重复初始化
4. **安全优先**: 所有路径操作强制校验，防止穿越攻击
5. **清晰分层**: shared/ 放置通用工具，services/ 放置业务逻辑

## Learnings from Phase 5: Integration Tests

## Testing Services with Dependencies

- **Mocking Electron**: The `LoggerService` depends on `app.getPath('userData')`. When testing services that use the logger, we must mock `electron` module before importing the service.
  ```typescript
  vi.mock('electron', () => ({
    app: {
      getPath: vi.fn(() => os.tmpdir())
    }
  }))
  ```
- **Mocking External Libraries**: `GitService` uses `simple-git`. Mocking the library completely avoids the need for actual git repositories and allows controlling return values for `status`, `diff`, etc.
  ```typescript
  vi.mock('simple-git')
  // In test setup:
  vi.mocked(simpleGit).mockReturnValue(mockInstance)
  ```

## File System Testing

- **Isolation**: Create a unique temporary directory for each test in `beforeEach` and clean it up in `afterEach`.
- **Async Cleanup**: Use `fs.rm(dir, { recursive: true, force: true })` in `afterEach` to ensure cleanup even if tests fail.
- **Watcher Testing**: `FileTreeService` watcher tests require small delays (`setTimeout`) to allow the underlying `chokidar` watcher to initialize and detect changes.

## Service Singletons

- **Cleanup**: `FileTreeService` needs `closeAll()` to stop watchers. `GitService` needs `clearCache()` to reset cached instances.

## Path Validation

- Tests confirmed that `PathValidator` integration correctly blocks traversal attempts in both services, reinforcing security.

## [2026-01-31] Integration Tests - LLM Adapters

### Testing Patterns Discovered

- **Hoisted Mocks**: Use `vi.hoisted()` to define mocks that need to be accessed inside `vi.mock()` factories. This solves reference errors.
- **Class Mocks**: When mocking SDK classes (like `Anthropic`, `OpenAI`, `GoogleGenerativeAI`), return a class structure that matches the SDK's instantiation pattern.

### Mock Strategies

- **Stream Mocking**: Use async generators (`async function*`) to mock streaming responses. This accurately simulates how LLM SDKs return streams.
- **Dependency Injection**: Mock `electron` and `logger` before importing adapters to prevent runtime errors during test initialization.

### Challenges Encountered

- **Google Generative AI Mock**: The `GoogleGenerativeAI` SDK structure is complex. Mocking `getGenerativeModel` requires returning an object that has `startChat`, which in turn must return an object with `sendMessage` and `sendMessageStream`.
- **Undefined Properties**: `vi.mock` factories are hoisted, so variables defined outside them are not available unless using `vi.hoisted()`.

## [2026-01-31] Integration Tests Summary - Additional Work

### Files Created
- `tests/integration/llm-adapters.test.ts` - 315 lines, 13 tests covering all 4 LLM adapters

### Test Coverage
- **AnthropicAdapter**: 4 tests (non-streaming, streaming, retry logic, rate limits)
- **OpenAIAdapter**: 3 tests (non-streaming, streaming, error handling)
- **GeminiAdapter**: 3 tests (non-streaming, streaming, timeout handling)
- **OpenAICompatAdapter**: 3 tests (initialization, baseURL validation, custom endpoint)

### Key Learnings
1. **vi.hoisted() is essential** for sharing mock functions between test file scope and vi.mock() factories
2. **Mock chaining matters**: Gemini SDK requires mocking `getGenerativeModel().startChat().sendMessage()`
3. **Async generator pattern** (`async function*`) is perfect for mocking streaming responses
4. **All tests pass**: 13/13 ✅

### Verification Results
- ✅ `pnpm test tests/integration/llm-adapters.test.ts` - 13 passed
- ✅ `pnpm typecheck` - clean
- ✅ Zero TypeScript errors
