# CodeAll开发计划 - 可执行修正规范

> 本文档是 `codeall-development.md` 的强制性修正  
> 冲突时: 以本文档为准  
> 版本: v4 - 可执行版

---

## 规则1: 许可证合规 (强制)

### 实际许可证
- oh-my-opencode: **Sustainable Use (禁止商业分发)** → 仅参考思想,**禁止复制代码**
- eigent/moltbot/hello-halo/ccg-workflow: MIT/Apache-2.0 → 可复制代码

### CodeAll许可证
MIT License

### Task 0强制要求
- 复制的每个文件头部必须添加原版权声明
- `docs/licenses.md` 必须列出每个复制文件的清单
- **停止条件**: 如发现必须复制oh-my-opencode代码,立即停止开发

---

## 规则2: 文件路径替换表 (强制)

主计划中所有路径引用,按此表替换:

| 主计划错误路径 | 正确路径 (相对仓库根) |
|-------------|-------------------|
| `hello-halo/src/main/preload.ts` | `参考项目/hello-halo/src/preload/index.ts` |
| `hello-halo/vite.config.ts` | `参考项目/hello-halo/electron.vite.config.ts` |
| `hello-halo/src/main/services/browser-view/manager.ts` | `参考项目/hello-halo/src/main/services/browser-view.service.ts` |
| `eigent/backend/` | **不存在,需重写** |
| `ccg-workflow/.claude/commands/` | `参考项目/ccg-workflow/templates/commands/` |

---

## 规则3: Event Schema权威性 (强制)

### MVP1阶段 (Phase 1)
**Task 0生成`src/types/events.ts`时**:
- 严格按主计划`Core Domain Model > Event Schema`的完整定义实现
- 包含所有IPCEvent和StateEvent联合类型
- **即使某些channel在MVP1不实现handler,类型也必须存在**

### MVP2/MVP3扩展
- 新增channel时,必须同步更新`src/types/events.ts`
- 每次更新后运行`pnpm tsc --noEmit`验证无类型错误

### 验收标准
```bash
# Task 0完成后
pnpm tsc --noEmit  # 必须通过
grep "IPCEvent" src/types/events.ts  # 必须包含所有主计划定义的channel
```

---

## 规则4: IPC命名规范 (强制)

### API对象名
`window.codeall` (不是window.api或window.halo)

### Channel命名
`<模块>:<操作>` (kebab-case)

例: `message:send`, `task:create`, `browser:navigate`

---

## 规则5: oh-my-opencode重写规范 (强制)

**Task 12: delegate_task引擎**

禁止行为:
- ❌ 复制`src/tools/delegate-task/tools.ts`
- ❌ 复制BackgroundManager
- ❌ 使用相同的类名/函数名

允许行为:
- ✅ 阅读思想
- ✅ 自行实现核心API
- ✅ 使用不同的文件结构和命名

验收:
- 代码审查无相同命名
- licenses.md明确标注"仅参考思想"

---

## 规则6: Workforce异常处理规范 (强制)

**Task 13: Workforce引擎**

### JSON Schema (固定)
```typescript
interface WorkforceSubTask {
  name: string;           // 必须唯一
  description: string;
  dependencies: string[]; // 必须是有效name列表
}
```

### 异常处理规则

**规则6.1**: JSON解析失败 → 降级为单任务
```typescript
catch (parseError) {
  logger.error('Task decompose failed, fallback to single task');
  return [{ name: '原始任务', description: originalInput, dependencies: [] }];
}
```

**规则6.2**: 循环依赖检测 → Fail Fast
```typescript
if (detectCycle(tasks)) {
  throw new Error('Circular dependency detected, task failed');
  // 更新Task状态为'failed',不尝试修复
}
```

**规则6.3**: 依赖引用不存在的任务 → 忽略该依赖
```typescript
task.dependencies = task.dependencies.filter(dep => 
  tasks.some(t => t.name === dep)
);
logger.warn(`Invalid dependency ${dep} removed`);
```

### 验收标准
```bash
# 单元测试必须覆盖
- JSON解析失败场景
- 循环依赖检测
- 无效依赖处理
```

---

## 规则7: 验收标准量化 (强制)

| 主计划主观标准 | 修正后量化标准 |
|-------------|-------------|
| "符合hello-halo风格" | "使用TailwindCSS,dark模式,参考hello-halo任一组件样式" |
| "安装包大小合理" | "<200MB (含Electron+pg-embed)" |
| "冷启动时间" | "<5s (点击图标→显示主界面)" |
| "单Run内存" | "<500MB (Chrome DevTools Memory)" |

---

## 使用方法

1. **阅读顺序**: 先读本文档所有规则,再读主计划
2. **冲突解决**: 本文档规则优先级高于主计划
3. **验收**: 每个规则都有对应验收标准,必须通过

---

**最终状态**: 可执行版,所有歧义已明确
