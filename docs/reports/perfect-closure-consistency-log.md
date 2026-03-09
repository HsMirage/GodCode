# PF-1 证据口径对齐与冲突清零归档

## 1. 任务信息
- 任务ID：`PF-1`
- 执行日期：`2026-03-03`
- 执行人：`Halo`
- 目标：统一 `final-acceptance` 与各测试报告的结论口径，清零冲突。

## 2. 同名结论跨文档对照表

| 主题 | 文档 | 当前结论 | 口径状态 | 说明 |
|---|---|---|---|---|
| Unit 基线 | `docs/final-acceptance.md` | `FAIL (10 passed, 1 failed)` | 一致 | 与 `docs/test-reports/unit.md` 对齐 |
| Unit 基线 | `docs/test-reports/unit.md` | `未通过`（`10 passed, 1 failed`） | 一致 | 失败点为 `ipc-alignment` |
| Integration/E2E 基线 | `docs/final-acceptance.md` | `PARTIAL (27 passed, 9 failed)` | 一致 | 与 `docs/test-reports/integration.md` 对齐 |
| Integration/E2E 基线 | `docs/test-reports/integration.md` | `未通过`（`27 passed, 9 failed`） | 一致 | 启动阻塞已解除，执行阶段仍失败 |
| Performance 基线 | `docs/final-acceptance.md` | `PARTIAL (5 passed, 1 failed)` | 一致 | 与 `docs/test-reports/performance.md` 对齐 |
| Performance 基线 | `docs/test-reports/performance.md` | `通过（附条件）`（`5 passed, 1 failed`） | 一致 | 明确为条件性通过，非全绿 |
| Hook 审计（定向） | `docs/test-reports/hook-audit-closure.md` | `PASS（P1-1-C 任务内定向回归）` | 一致 | 明确限定为定向任务回归，不代表发布基线 |
| 发布签署结论 | `docs/final-acceptance.md` | `Release Sign-off: NOT APPROVED` | 一致 | 与 FAIL/BLOCKED 门禁状态一致 |

## 3. 冲突修正清单
1. 修正 `docs/test-reports/hook-audit-closure.md` 状态描述，增加“仅对应 P1-1-C 定向回归”限定，避免与发布基线口径混淆。
2. 在 `docs/test-reports/hook-audit-closure.md` 补充 PF-1 复核记录：复核时间、复核人、对照依据文档、口径说明。
3. 复核 `unit/integration/performance` 三份报告的复核字段，确认“复核时间/复核人/依据命令”已齐全，无缺口。

## 4. 复核信息
- 复核时间：`2026-03-03`
- 复核人：`Halo`
- 依据命令：
  - 文档一致性复核（本任务未执行代码/测试命令，仅对既有报告与验收文档进行事实对照）
- 依据文档：
  - `docs/final-acceptance.md`
  - `docs/test-reports/hook-audit-closure.md`
  - `docs/test-reports/unit.md`
  - `docs/test-reports/integration.md`
  - `docs/test-reports/performance.md`

## 5. 验收结论（PF-1）
- 结论：`通过`
- 判定：同名测试/门禁结论跨文档无冲突；Hook 报告与全局发布基线的语义边界已显式化。
