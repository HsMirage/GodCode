# 测试报告模板（统一）

> 适用范围：单元测试 / 集成测试 / 性能测试 / 发布前检查（Release Preflight）

## 1. 基本信息
- 报告类型：`<unit | integration | performance | release-preflight>`
- 报告日期：`YYYY-MM-DD`
- 项目版本：`<版本号或提交哈希>`
- 分支：`<branch-name>`
- 执行人：`<name>`
- 发布候选标识（Release Candidate）：`<rc-tag or build id>`

## 2. 环境信息
- 操作系统：`<OS + 版本>`
- Node.js：`<version>`
- 包管理器：`<pnpm/yarn/npm + version>`
- 测试框架：`<vitest/playwright/自定义>`
- 关键依赖版本：
  - `<依赖A>: <version>`
  - `<依赖B>: <version>`

## 3. 执行命令（可复现）
```bash
<完整命令1>
<完整命令2>
```

## 4. 结果摘要
- 总体状态：`<PASS | FAIL | PARTIAL | BLOCKED>`
- 用例/场景总数：`<N>`
- 通过：`<N>`
- 失败：`<N>`
- 跳过：`<N>`
- 关键结论（1-3条）：
  1. `<结论1>`
  2. `<结论2>`
  3. `<结论3>`

## 5. 失败明细（无失败可写“无”）
| 序号 | 模块/用例 | 失败现象 | 直接证据（日志/截图/报告路径） | 初步原因 | 是否阻塞验收 |
|---|---|---|---|---|---|
| 1 | `<name>` | `<error>` | `<path or snippet>` | `<reason>` | `<是/否>` |

## 6. 性能观测（性能测试必填，其他类型按需）
- 关键指标：
  - `<指标1>`: `<结果>`（目标：`<阈值>`）
  - `<指标2>`: `<结果>`（目标：`<阈值>`）
- 资源占用：
  - CPU：`<结果>`
  - 内存：`<结果>`
- 稳定性结论：`<结论>`

## 7. 验收结论
- 结论：`<通过 | 未通过>`
- 判定依据：
  1. `<依据1>`
  2. `<依据2>`
- 后续动作：
  - `<动作1>`
  - `<动作2>`

## 8. 附件与归档
- 原始日志：`<path>`
- 测试报告产物：`<path>`
- 关联文档：`<path>`

## 9. 发布前检查执行记录（报告类型=release-preflight 必填）

| 检查项ID | 平台 | 执行命令/操作 | 结果（PASS/FAIL/BLOCKED） | 证据路径 | 备注 |
|---|---|---|---|---|---|
| RLS-BUILD-WIN | Windows | `pnpm build:win` | `<PASS/FAIL/BLOCKED>` | `<path>` | `<note>` |
| RLS-BUILD-MAC | macOS | `pnpm build:mac` | `<PASS/FAIL/BLOCKED>` | `<path>` | `<note>` |
| RLS-BOOT-WIN | Windows | `<install + launch>` | `<PASS/FAIL/BLOCKED>` | `<path>` | `<note>` |
| RLS-BOOT-MAC | macOS | `<launch app bundle>` | `<PASS/FAIL/BLOCKED>` | `<path>` | `<note>` |
| RLS-FLOW-CHAT | Windows/macOS | `<core chat flow>` | `<PASS/FAIL/BLOCKED>` | `<path>` | `<note>` |
| RLS-FLOW-DELEGATE | Windows/macOS | `<delegate/workforce flow>` | `<PASS/FAIL/BLOCKED>` | `<path>` | `<note>` |
| RLS-FLOW-BROWSER | Windows/macOS | `<ai-browser flow>` | `<PASS/FAIL/BLOCKED>` | `<path>` | `<note>` |

- 发布前检查总结：
  - 总检查项：`<N>`
  - 通过：`<N>`
  - 失败：`<N>`
  - 阻塞：`<N>`
- 发布判定：`<可发布 | 不可发布>`
- 判定理由：
  1. `<reason 1>`
  2. `<reason 2>`
