# CodeAll开发计划 - 快速执行指南

> 简化版说明文档，配合主计划使用  
> 项目性质：**私人项目，不公开发布** - 可自由复制所有参考项目代码

---

## 重要简化说明

### 许可证问题 - 已解决 ✅

**CodeAll是私人项目，不公开发布**，因此：
- ✅ **可以直接复制所有参考项目的代码**
- ✅ 包括oh-my-opencode (Sustainable Use License允许内部使用)
- ✅ 无需担心许可证兼容性
- ✅ 建议在代码中保留原作者注释作为致谢，但非强制

### Task 0简化

原计划中的"许可证检查"任务可跳过或简化为：
- 创建简单的 `docs/acknowledgments.md` 致谢文档即可
- 无需严格的许可证合规检查

---

## 参考项目代码复用策略

### 直接复制策略（推荐）

| 参考项目 | 可复制内容 | 建议复制路径 |
|---------|-----------|------------|
| **oh-my-opencode** | delegate_task机制, BackgroundManager | 直接复制 `src/tools/delegate-task/`, `src/features/background-agent/` |
| **eigent** | Workforce引擎 (Python→TypeScript转换) | 参考 `backend/app/utils/workforce.py` 用TypeScript重写 |
| **hello-halo** | BrowserView, IPC, UI组件 | 直接复制 `src/main/services/browser-view.service.ts`, `src/main/ipc/`, `src/renderer/components/` |
| **moltbot** | Subagent机制, TypeBox协议 | 直接复制 `src/agents/tools/sessions-spawn-tool.ts` |
| **ccg-workflow** | 命令模板, 路由思想 | 参考 `templates/` 结构 |

### 实际文件路径（已验证存在）

```bash
# oh-my-opencode
参考项目/oh-my-opencode/src/tools/delegate-task/tools.ts
参考项目/oh-my-opencode/src/features/background-agent/

# eigent (后端确实存在!)
参考项目/eigent/backend/app/utils/workforce.py

# hello-halo
参考项目/hello-halo/src/preload/index.ts
参考项目/hello-halo/src/main/ipc/
参考项目/hello-halo/src/main/services/browser-view.service.ts
参考项目/hello-halo/electron.vite.config.ts

# moltbot
参考项目/moltbot/src/agents/tools/sessions-spawn-tool.ts

# ccg-workflow
参考项目/ccg-workflow/templates/commands/
```

---

## 快速开始检查清单

开始执行主计划前，确认：

- [ ] 阅读主计划：`.sisyphus/plans/codeall-development.md`
- [ ] 理解MVP迭代式开发：MVP1 → MVP2 → MVP3 → Final
- [ ] 准备开发环境：Node.js, pnpm, PostgreSQL或pg-embed
- [ ] 确认可以直接复制参考项目代码（私人项目特权）

---

## 关键修正（主计划中的小错误）

### 文件路径修正
| 主计划引用 | 实际路径 |
|-----------|---------|
| `hello-halo/vite.config.ts` | `hello-halo/electron.vite.config.ts` |
| `hello-halo/src/main/preload.ts` | `hello-halo/src/preload/index.ts` |
| `eigent/backend/ 不存在` | **存在**: `eigent/backend/app/utils/workforce.py` |

### IPC命名
- API对象：`window.codeall` (不是window.api)
- Channel格式：`<模块>:<操作>` (如 `message:send`)

---

## 执行建议

1. **按Phase顺序执行**：Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4
2. **每个Task完成后提交代码**：保持小步迭代
3. **遇到路径问题**：参考本文档的"实际文件路径"表
4. **复用代码时**：建议保留原注释，方便后续理解

---

## 下一步

运行 `/start-work` 开始执行开发计划！

**主计划位置**: `.sisyphus/plans/codeall-development.md`

---

**版本**: 快速执行版 v1.0  
**更新时间**: 2026-01-28  
**项目性质**: 私人项目，可自由复制参考代码
