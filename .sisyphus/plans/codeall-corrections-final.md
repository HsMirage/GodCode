# CodeAll开发计划 - 关键修正 FINAL

> 本文档修正 `codeall-development.md` 中的关键执行问题  
> 阅读顺序: 同时参考本文档与主计划  
> 版本: v3 - 简化版(聚焦阻断性问题)

---

## 修正1: 许可证合规 (最关键)

### 实际情况

| 项目 | 许可证 | CodeAll策略 |
|------|--------|-----------|
| **oh-my-opencode** | Sustainable Use (非商业限制) | **仅参考思想,完全重写** |
| eigent | Apache-2.0 | 可复制代码 (本仓库缺后端,需重写) |
| moltbot | MIT | 可复制代码 |
| hello-halo | MIT | 可复制代码 |
| ccg-workflow | MIT | 仅参考思想 |

### CodeAll许可证
MIT License

### Task 0验收修正

替换主计划中的"检查许可证兼容性",改为:

**创建 `docs/licenses.md`**:

```markdown
# 许可证合规声明

## CodeAll License
MIT License

## 参考项目

### 从以下项目复制了代码 (已保留版权声明):
[在实际开发中填充具体文件清单]

示例格式:
- `src/main/services/browser-view.service.ts` ← hello-halo (MIT)
- `src/renderer/components/workflow/` ← eigent前端代码 (Apache-2.0)

### 仅参考思想,完全重写:
- oh-my-opencode (Sustainable Use License - 不兼容分发)
- ccg-workflow (参考多模型路由思想)
```

**停止条件**: 如必须复制oh-my-opencode代码,立即停止并报告用户。

---

## 修正2: 文件路径修正

### 本仓库实际路径 (已验证)

| 计划引用 | 实际路径 | 说明 |
|---------|---------|-----|
| hello-halo预加载 | `/参考项目/hello-halo/src/preload/index.ts` | ✅ 存在 |
| hello-halo配置 | `/参考项目/hello-halo/electron.vite.config.ts` | ✅ 存在 |
| hello-halo IPC | `/参考项目/hello-halo/src/main/ipc/` | ✅ 存在,包含index.ts/conversation.ts等 |
| hello-halo服务 | `/参考项目/hello-halo/src/main/services/browser-view.service.ts` | ✅ 存在 |
| eigent后端 | 不存在 (仅前端代码) | ❌ 需重写 |
| ccg-workflow命令 | `/参考项目/ccg-workflow/templates/commands/` | ✅ 存在 |

### 应用到任务

- **Task 2**: 参考 `hello-halo/src/main/ipc/index.ts` 和各handler文件
- **Task 17**: 参考 `hello-halo/src/main/services/browser-view.service.ts`
- **Task 13**: eigent后端不存在,参考文档总结+TypeScript重写

---

## 修正3: IPC契约冻结

### 命名规范
- API对象: `window.codeall` (不是window.api)
- Channel格式: `<模块>:<操作>` (kebab-case)

### MVP1最小Channel集

参考主计划`Event Schema`,MVP1只实现以下channel:

```typescript
// IPC调用 (renderer → main)
'space:create' | 'space:list'
'session:create'  
'message:send'
'model:configure'

// 事件监听 (main → renderer)
'message:created'
'task:status-changed'
```

**扩展策略**: MVP2/MVP3根据需要添加新channel,同步更新主计划Event Schema。

---

## 修正4: oh-my-opencode重写要点

**Task 12: delegate_task引擎**

禁止复制代码,必须自行实现:

```typescript
// 核心API (思想相同,代码不同)
interface DelegateParams {
  description: string;
  prompt: string;
  category?: 'quick' | 'visual-engineering' | 'ultrabrain';
  subagent_type?: 'oracle' | 'explore';
}

async function delegateTask(parentId: string, params: DelegateParams): Promise<Result>
{
  // 1. 查配置 (自定义格式)
  // 2. 创建子Task (Prisma)
  // 3. 调用LLM adapter
  // 4. 返回结果
}
```

---

## 修正5: Workforce重写契约

**Task 13: Workforce引擎**

eigent后端代码不在本仓库,必须TypeScript重写:

```typescript
// 固定JSON Schema (LLM输出格式)
interface WorkforceSubTask {
  name: string;
  description: string;
  dependencies: string[];  // 其他任务name列表
}

// 拆解失败时的兜底
async function decomposeTask(input: string): Promise<WorkforceSubTask[]> {
  try {
    // LLM拆解
  } catch {
    // 返回单任务
    return [{ name: '原始任务', description: input, dependencies: [] }];
  }
}

// DAG构建 (Kahn算法)
function buildDAG(tasks): Level[] {
  // 返回分层结构,每层可并行
}
```

---

## 修正6: 验收标准具体化

| 原标准 | 修正后 |
|--------|--------|
| "符合hello-halo风格" | "TailwindCSS dark模式,参考hello-halo实际组件样式" |
| "安装包大小合理" | "<200MB" |
| "冷启动时间" | "<5s (从点击到显示)" |

---

## 使用指南

1. **主计划 + 本修正文档 = 完整计划**
2. **冲突时**: 以本修正文档为准
3. **停止条件**: 遇到许可证/技术无法解决的问题,立即停止报告

---

**状态**: 简化版,聚焦可执行性
