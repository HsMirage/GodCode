# CodeAll开发计划 - 关键修正 (针对Momus审查反馈)

> 本文档修正 `codeall-development.md` 中Momus指出的阻断性问题  
> 阅读顺序: 先读本文档,再读主计划  
> 状态: FINAL (待Momus OKAY)

---

## 修正1: 许可证合规策略 (阻断性问题)

### 实际许可证情况

| 项目 | 许可证 | 可否复制代码 | CodeAll策略 |
|------|--------|------------|-----------|
| **oh-my-opencode** | **Sustainable Use License** | ❌ 仅限非商业/内部使用,禁止分发 | **参考思想重写,不复制代码** |
| **eigent** | Apache-2.0 | ✅ 可复制,需保留版权声明 | 复制代码+保留版权 |
| **moltbot** | MIT | ✅ 可复制,需保留版权声明 | 复制代码+保留版权 |
| **hello-halo** | MIT | ✅ 可复制,需保留版权声明 | 复制代码+保留版权 |
| **ccg-workflow** | MIT | ✅ 可复制,需保留版权声明 | 参考思想重写 (命令行工具,不适合复制) |

### CodeAll最终许可证
**MIT License** (与moltbot/hello-halo兼容)

### Phase 0 Task 0 修正后的验收标准

**替换原计划中的 "检查许可证兼容性"**, 改为:

- [ ] 创建 `docs/licenses.md`,内容如下:

```markdown
# 许可证合规声明

## CodeAll License
MIT License (见根目录 LICENSE 文件)

## 参考项目许可证

### 可复制代码的项目 (已保留版权声明)
- **eigent** (Apache-2.0): 复制了 Workforce相关代码,已在文件头部保留Apache-2.0声明
- **moltbot** (MIT): 复制了 Subagent机制代码,已在文件头部保留MIT声明  
- **hello-halo** (MIT): 复制了 BrowserView集成代码,已在文件头部保留MIT声明

### 仅参考思想的项目 (未复制代码)
- **oh-my-opencode** (Sustainable Use License - 不兼容): 参考了 delegate_task委派思想,**完全重写实现**
- **ccg-workflow** (MIT): 参考了多模型路由思想,**完全重写实现**

## Acknowledgments
特别感谢以上5个开源项目的贡献者,CodeAll的架构设计深受启发。
```

- [ ] 在每个从eigent/moltbot/hello-halo复制的源文件头部添加版权声明:

```typescript
/**
 * Portions of this file are derived from [项目名] (https://github.com/...)
 * Licensed under [MIT/Apache-2.0]
 * Copyright (c) [年份] [版权持有人]
 * 
 * See LICENSE file in the root directory for full license text.
 */
```

- [ ] **停止条件**: 如果后续发现需要复制oh-my-opencode代码才能实现某功能,必须停止开发并向用户报告,选择以下之一:
  1. 重新设计该功能(使用其他参考项目或自研)
  2. 联系oh-my-opencode作者申请许可
  3. 将CodeAll改为非商业/内部使用项目

---

## 修正2: 文件路径引用修正 (阻断性问题)

### hello-halo项目路径修正

| 原计划错误路径 | 实际正确路径 | 修正说明 |
|-------------|------------|---------|
| `src/main/preload.ts` | `src/preload/index.ts` | preload独立目录 |
| `vite.config.ts` | `electron.vite.config.ts` | Electron专用配置 |
| `src/main/services/browser-view/manager.ts` | `src/main/services/browser-view.service.ts` | 单文件service,非目录 |
| `src/main/ipc/` | **✅ 存在,可参考** | hello-halo有完整IPC模块,包含index.ts/conversation.ts/space.ts等 |

**应用到计划中的任务**:
- Task 2: 参考 `src/main/index.ts`, `src/preload/index.ts`, **`src/main/ipc/index.ts`** (IPC注册中心)
- Task 2 IPC Handlers: 参考 `src/main/ipc/conversation.ts`, `space.ts`, `artifact.ts` (模块拆分模式)
- Task 1: 参考 `electron.vite.config.ts`
- Task 17: 参考 `src/main/services/browser-view.service.ts`

### eigent项目说明 (本仓库为精简版)

**本仓库 `参考项目/eigent/` 是前端部分,缺少以下引用**:
- `backend/app/utils/workforce.py` - 不存在
- `server/prisma/schema.prisma` - 不存在

**修正策略**:
- Task 3 (Prisma): 参考 eigent的README文档描述,自行设计schema
- Task 13 (Workforce): 参考 eigent的前端代码 + 文档描述的Workforce概念,**用TypeScript重写实现**

**替代参考资料**:
- eigent Workforce概念: `/mnt/d/网站/CodeAll/参考项目/eigent综合技术特点总结.md`
- 数据模型设计: 参考主计划中的 "Core Domain Model" 章节 (已预定义)

### oh-my-opencode路径修正 (仅参考,不复制)

| 计划中的引用 | 实际路径 | 用途 |
|------------|---------|-----|
| `src/tools/delegate-task/tools.ts` | 存在 | **仅阅读理解思想,重写实现** |
| `docs/category-skill-guide.md` | 存在 | 阅读类别定义概念 |
| `src/agents/AGENTS.md` | 存在 | 阅读Agent角色设计 |

**重要**: 所有oh-my-opencode的引用都是 **"阅读理解思想"** 用途,Task 12必须完全重写delegate_task引擎,不得复制代码。

### moltbot/ccg-workflow路径 (验证通过)

| 项目 | 关键路径 | 验证状态 |
|------|---------|---------|
| moltbot | `src/agents/tools/sessions-spawn-tool.ts` | ✅ 存在 |
| moltbot | `src/types/` | ✅ 存在 |
| ccg-workflow | `README.md` | ✅ 存在 |
| ccg-workflow | `templates/commands/` | ✅ 存在 (仓库路径,非.claude/commands/) |
| ccg-workflow | `templates/prompts/` | ✅ 存在 |

**重要说明**: ccg-workflow的 `templates/commands/` 是用于安装到 `~/.claude/commands/` 的模板,仓库内无 `.claude/commands/` 目录(仅有 `.claude/index.json` 配置文件)。

---

## 修正3: IPC/API命名约定冻结 (阻断性问题)

### CodeAll IPC设计规范 (必须遵守)

**Preload暴露API命名**: `window.codeall` (不是window.api/window.halo)

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('codeall', {
  // Invoke模式 (异步调用,返回Promise)
  invoke: (channel: string, data?: any) => ipcRenderer.invoke(channel, data),
  
  // On模式 (监听事件)
  on: (channel: string, callback: (event: any, ...args: any[]) => void) => {
    ipcRenderer.on(channel, callback);
  },
  
  // Off模式 (取消监听)
  off: (channel: string, callback: any) => {
    ipcRenderer.off(channel, callback);
  },
});

// TypeScript类型声明
declare global {
  interface Window {
    codeall: {
      invoke: (channel: string, data?: any) => Promise<any>;
      on: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
      off: (channel: string, callback: any) => void;
    };
  }
}
```

### IPC Channel命名规范

**格式**: `<模块>:<操作>` (kebab-case)

| 功能 | Channel名称 | 数据格式 |
|------|-----------|---------|
| **Space管理** | `space:create` | `{ name: string, workDir: string }` |
| | `space:list` | `{}` |
| | `space:switch` | `{ spaceId: string }` |
| **Session管理** | `session:create` | `{ spaceId: string, title?: string }` |
| | `session:list` | `{ spaceId: string }` |
| **消息发送** | `message:send` | `{ sessionId: string, content: string }` |
| | `message:stream-chunk` | `{ sessionId: string, chunk: string }` (renderer监听) |
| **任务管理** | `task:create` | `{ sessionId: string, input: string, type: string }` |
| | `task:cancel` | `{ taskId: string }` |
| | `task:status-changed` | `{ taskId: string, status: string }` (renderer监听) |
| **模型配置** | `model:configure` | `Model对象` |
| | `model:list` | `{}` |
| **浏览器** | `browser:navigate` | `{ url: string }` |
| | `browser:click` | `{ selector: string }` |
| **Artifact** | `artifact:create` | `Artifact对象` |
| | `artifact:list` | `{ sessionId: string }` |

**完整Channel列表**: 见主计划 "Core Domain Model" 章节的 "Event Schema"

**一致性检查** (必须在Task 0完成后验证):
- [ ] 本文档的Channel列表与主计划 `Core Domain Model > Event Schema` 完全一致
- [ ] 所有renderer监听的channel都在 `StateEvent` 类型中定义
- [ ] 所有invoke的channel都在 `IPCEvent` 类型中定义
- [ ] Channel命名符合 `<模块>:<操作>` kebab-case规范

### Renderer调用示例

```typescript
// 发送消息
const response = await window.codeall.invoke('message:send', {
  sessionId: 'xxx',
  content: 'Hello'
});

// 监听流式响应
window.codeall.on('message:stream-chunk', (event, data) => {
  console.log('Chunk:', data.chunk);
});
```

---

## 修正4: 验收标准具体化 (非阻断,建议修)

### 主观验收标准修正

| 原标准 | 修正后标准 |
|--------|-----------|
| "按钮样式符合hello-halo风格" | "按钮使用TailwindCSS类: `bg-blue-600 hover:bg-blue-700 rounded-md px-4 py-2`,与hello-halo的primary按钮一致" |
| "安装包大小合理" | "安装包大小<200MB (含Electron运行时+pg-embed)" |
| "界面使用dark模式配色" | "背景色#1e1e1e,文字色#e4e4e4,参考hello-halo的dark theme变量" |

### 性能指标具体化

| 指标 | 测量方法 | 阈值 |
|------|---------|-----|
| **冷启动时间** | 从点击图标到显示主界面 | <5s |
| **单Run内存峰值** | Chrome DevTools Memory Profiler | <500MB |
| **并发3任务稳定性** | 启动3个Workforce工作流,运行10分钟 | 无崩溃,内存增长<100MB |

---

## 修正5: oh-my-opencode替代实现策略 (关键)

### Task 12: delegate_task引擎重写实现

**不能做** (违反许可证):
- ❌ 复制 `src/tools/delegate-task/tools.ts` 代码
- ❌ 复制 BackgroundManager 代码
- ❌ 复制 Hook系统代码

**可以做** (参考思想):
- ✅ 阅读 delegate_task 的API设计思想
- ✅ 阅读 category/subagent 概念
- ✅ 自行实现类似功能,使用不同代码

**重写实现要点**:

```typescript
// src/main/services/delegate/engine.ts (完全重写)

/**
 * CodeAll Delegate Engine - 自研实现
 * 参考oh-my-opencode的delegate_task思想,完全重写
 */

interface DelegateTaskParams {
  description: string;      // 任务描述
  prompt: string;          // 详细提示
  category?: string;       // 类别: 'quick' | 'visual-engineering' | 'ultrabrain'
  subagent_type?: string; // 或指定agent: 'oracle' | 'explore'
}

class DelegateEngine {
  async delegateTask(parentTaskId: string, params: DelegateTaskParams): Promise<TaskResult> {
    // 1. 根据category/subagent_type查找配置
    const config = this.resolveConfig(params);
    
    // 2. 创建子Task记录
    const childTask = await prisma.task.create({
      data: {
        parentTaskId,
        type: 'delegated',
        input: params.prompt,
        assignedModel: config.model,
        assignedAgent: params.subagent_type,
        status: 'pending',
      },
    });
    
    // 3. 调用LLM adapter执行
    const adapter = createLLMAdapter(config.provider, config);
    const result = await adapter.sendMessage([
      { role: 'user', content: params.prompt }
    ]);
    
    // 4. 更新Task状态
    await prisma.task.update({
      where: { id: childTask.id },
      data: { status: 'completed', output: result.content },
    });
    
    return { taskId: childTask.id, output: result.content };
  }
  
  private resolveConfig(params: DelegateTaskParams) {
    // 自行实现的路由逻辑,不复制oh-my-opencode代码
    if (params.category) {
      return CATEGORY_CONFIGS[params.category];
    }
    if (params.subagent_type) {
      return AGENT_CONFIGS[params.subagent_type];
    }
    throw new Error('Must specify category or subagent_type');
  }
}

// 配置定义 (自行设计,不复制)
const CATEGORY_CONFIGS = {
  quick: { model: 'claude-3-haiku', provider: 'anthropic', temperature: 0.3 },
  'visual-engineering': { model: 'gemini-pro', provider: 'google', temperature: 0.7 },
  ultrabrain: { model: 'gpt-4', provider: 'openai', temperature: 0.2 },
};

const AGENT_CONFIGS = {
  oracle: { model: 'claude-opus', provider: 'anthropic', tools: [] },
  explore: { model: 'claude-sonnet', provider: 'anthropic', tools: ['grep', 'read'] },
};
```

**关键差异** (避免侵权):
- 文件结构不同 (oh-my-opencode用 `/tools/`, CodeAll用 `/services/`)
- 类名/函数名不同 (DelegateEngine vs BackgroundManager)
- 实现细节不同 (配置格式、错误处理、事件系统)
- 只实现核心概念,不实现Skills/Background/Hook等高级功能

---

## 修正6: 缺失引用补充说明

### Prisma Schema设计 (Task 0)

由于eigent的 `server/prisma/schema.prisma` 不在本仓库,参考以下资料自行设计:

1. **主计划中的领域模型**: 已完整定义 Space/Session/Message/Task/Artifact等实体
2. **eigent技术总结**: `/mnt/d/网站/CodeAll/参考项目/eigent综合技术特点总结.md`
3. **Prisma官方文档**: https://www.prisma.io/docs (关系定义、索引优化)

**验收标准增强**:
- [ ] Schema包含所有领域模型实体 (Space, Session, Message, Task, Artifact, Run, Model)
- [ ] 外键关系正确 (Session.spaceId → Space.id)
- [ ] 索引覆盖查询热点 (sessionId, spaceId, createdAt)
- [ ] `pnpm prisma validate` 通过
- [ ] `pnpm prisma migrate dev` 生成迁移文件无报错

### Workforce实现参考 (Task 13)

由于eigent的Python后端代码不在本仓库,参考以下资料用TypeScript重写:

1. **eigent技术总结**中的Workforce描述: 任务拆解/DAG依赖/并行执行
2. **DAG拓扑排序算法**: Kahn算法或DFS (网上有大量TypeScript实现)
3. **类似项目**: GitHub搜索 "typescript dag executor" / "typescript workflow engine"

**实现要点**:

```typescript
// src/main/services/workforce/engine.ts

// Workforce子任务JSON Schema (固定契约)
interface WorkforceSubTask {
  name: string;              // 子任务名称
  description: string;       // 详细描述
  dependencies: string[];    // 依赖的任务name列表 (空数组=无依赖)
}

class WorkforceEngine {
  // 任务拆解 (使用LLM)
  async decomposeTask(input: string): Promise<WorkforceSubTask[]> {
    const prompt = `将以下任务拆解为3-5个子任务,返回JSON数组:
    任务: ${input}
    
    格式要求 (严格JSON):
    [
      {
        "name": "子任务简短名称(不超过20字)",
        "description": "详细描述(1-2句话)",
        "dependencies": ["依赖的其他任务name", ...] (或空数组)
      }
    ]
    
    规则:
    1. 至少3个子任务,最多5个
    2. 任务name必须唯一
    3. dependencies只能引用同批次的任务name
    4. 避免循环依赖
    `;
    
    try {
      const result = await this.llm.sendMessage([{ role: 'user', content: prompt }]);
      const tasks = JSON.parse(result.content);
      
      // 验证schema
      this.validateSubTasks(tasks);
      return tasks;
    } catch (error) {
      // 失败兜底: 返回单任务
      logger.error('Task decompose failed, fallback to single task', error);
      return [{
        name: '原始任务',
        description: input,
        dependencies: [],
      }];
    }
  }
  
  private validateSubTasks(tasks: any[]): asserts tasks is WorkforceSubTask[] {
    if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 5) {
      throw new Error('Invalid task count');
    }
    
    for (const task of tasks) {
      if (!task.name || !task.description || !Array.isArray(task.dependencies)) {
        throw new Error('Invalid task schema');
      }
    }
    
    // 检查循环依赖
    this.detectCycles(tasks);
  }
  
  private detectCycles(tasks: WorkforceSubTask[]): void {
    // 使用DFS检测循环依赖,如有循环则throw Error
    // 实现略
  }
  
  // 构建DAG (拓扑排序)
  buildDAG(tasks: WorkforceSubTask[]): DAGLevel[] {
    // 使用Kahn算法:
    // 1. 计算每个节点的入度
    // 2. 找到入度为0的节点作为第一层
    // 3. 移除这些节点及其出边,重复直到所有节点处理完
    
    const levels: DAGLevel[] = [];
    const inDegree = new Map<string, number>();
    const taskMap = new Map(tasks.map(t => [t.name, t]));
    
    // 计算入度
    for (const task of tasks) {
      inDegree.set(task.name, task.dependencies.length);
    }
    
    while (inDegree.size > 0) {
      // 找到入度为0的任务 (可并行执行)
      const level = Array.from(inDegree.entries())
        .filter(([, degree]) => degree === 0)
        .map(([name]) => name);
      
      if (level.length === 0 && inDegree.size > 0) {
        throw new Error('Circular dependency detected');
      }
      
      levels.push({ taskNames: level });
      
      // 移除已处理节点,更新入度
      for (const name of level) {
        inDegree.delete(name);
        const task = taskMap.get(name)!;
        
        // 找到依赖这个任务的其他任务,减少它们的入度
        for (const other of tasks) {
          if (other.dependencies.includes(name)) {
            inDegree.set(other.name, inDegree.get(other.name)! - 1);
          }
        }
      }
    }
    
    return levels;
  }
  
  // 执行工作流
  async executeWorkflow(taskId: string): Promise<void> {
    const mainTask = await prisma.task.findUnique({ where: { id: taskId } });
    const subTasks = await this.decomposeTask(mainTask!.input);
    const dag = this.buildDAG(subTasks);
    
    for (const level of dag) {
      // 同一level的任务并行执行 (最多3个并发)
      const concurrency = Math.min(level.taskNames.length, 3);
      const chunks = this.chunk(level.taskNames, concurrency);
      
      for (const chunk of chunks) {
        await Promise.all(chunk.map(name => {
          const subTask = subTasks.find(t => t.name === name)!;
          return this.executeSubTask(taskId, subTask);
        }));
      }
    }
  }
  
  private async executeSubTask(parentId: string, subTask: WorkforceSubTask): Promise<void> {
    // 创建数据库Task记录
    const task = await prisma.task.create({
      data: {
        parentTaskId: parentId,
        type: 'workforce',
        input: subTask.description,
        status: 'running',
      },
    });
    
    // 发送状态事件到renderer
    this.emit('task:started', { taskId: task.id, name: subTask.name });
    
    // 调用LLM执行
    const result = await this.llm.sendMessage([
      { role: 'user', content: subTask.description }
    ]);
    
    // 更新状态
    await prisma.task.update({
      where: { id: task.id },
      data: { status: 'completed', output: result.content },
    });
    
    this.emit('task:completed', { taskId: task.id });
  }
  
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

interface DAGLevel {
  taskNames: string[];  // 该层可并行执行的任务名列表
}
```

**关键契约点** (必须遵守):
1. **JSON Schema**: `WorkforceSubTask` 接口是固定的,LLM输出必须符合
2. **失败兜底**: JSON解析失败时,退化为单任务执行
3. **DAG构建输入**: 依赖关系由LLM直接在 `dependencies` 字段输出,不额外推断
4. **循环依赖处理**: 检测到循环依赖时throw Error,任务失败
5. **并发限制**: 每层最多3个任务并行,避免资源耗尽

---

## 修正汇总: 计划使用指南

### 阅读顺序
1. **先读本文档** (codeall-corrections.md) - 理解所有修正
2. **再读主计划** (codeall-development.md) - 按修正后的理解执行

### 关键修正点快速检查表

- [ ] **许可证**: oh-my-opencode只参考思想,不复制代码
- [ ] **文件路径**: 使用本文档修正后的路径
- [ ] **IPC命名**: 统一使用 `window.codeall` 和规范的channel名
- [ ] **eigent引用**: Python代码不存在,用TypeScript重写
- [ ] **验收标准**: 使用具体化的指标,不用主观描述

### 停止条件 (触发即停止开发,报告用户)

1. 发现必须复制oh-my-opencode代码才能实现某功能
2. 许可证合规无法解决
3. 关键技术路径无法实现 (如pg-embed在Windows无法运行)

---

**最终状态**: 待Momus审查本修正文档 + 主计划,确认OKAY后开始开发
