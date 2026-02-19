# Oh-My-OpenCode 源码分析项目（方案A） Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 产出可复核的 oh-my-opencode 源码分析文档套件，覆盖扫描顺序、Prompt 资产、调用关系、Skills 机制、多 Agent 编排与验收闭环。
**Architecture:** 采用“核心代码优先（`src/**`）+ 证据补充（`docs/**`、关键 `tests/**`）”的静态分析流程。先建立索引，再抽取 Prompt 资产并建图，再深挖 Skills 与协同编排，最后进行文档总装与一致性验收。全程执行 DRY/YAGNI/TDD（先写失败校验，再最小实现）。
**Tech Stack:** Markdown、Mermaid、Python 3（校验脚本片段）、Git、Claude Code（Glob/Grep/Read）。

---

## Execution Rules (Must Follow)

1. **先校验失败，再实现最小内容，再校验通过**（TDD）。
2. **每个任务独立提交一次**（frequent commits）。
3. **只写本次分析需要的内容**（YAGNI），不加无关章节。
4. 相关技能在执行时按需调用：
   - `@superpowers:dispatching-parallel-agents`（并行扫描）
   - `@superpowers:verification-before-completion`（结项前验证）
   - `@superpowers:requesting-code-review`（阶段复核）

---

### Task 1: 建立分析工作区骨架

**Files:**
- Create: `参考项目/oh-my-opencode-analysis/README.md`
- Create: `参考项目/oh-my-opencode-analysis/01-source-index.md`
- Create: `参考项目/oh-my-opencode-analysis/02-prompt-inventory-and-callgraph.md`
- Create: `参考项目/oh-my-opencode-analysis/03-skills-mechanism.md`
- Create: `参考项目/oh-my-opencode-analysis/04-agent-team-orchestration.md`
- Create: `参考项目/oh-my-opencode-analysis/05-information-flow.md`
- Create: `参考项目/oh-my-opencode-analysis/diagrams/prompt-asset-map.mmd`
- Create: `参考项目/oh-my-opencode-analysis/diagrams/prompt-lifecycle-sequence.mmd`
- Create: `参考项目/oh-my-opencode-analysis/diagrams/skill-execution-pipeline.mmd`
- Create: `参考项目/oh-my-opencode-analysis/diagrams/agent-orchestration-sequence.mmd`
- Create: `参考项目/oh-my-opencode-analysis/diagrams/model-routing-decision-tree.mmd`
- Create: `参考项目/oh-my-opencode-analysis/diagrams/resilience-loop.mmd`
- Test: 命令校验（内联 Python）

**Step 1: Write the failing test**

Run:
```bash
python - <<'PY'
from pathlib import Path
root = Path('参考项目/oh-my-opencode-analysis')
required = [
  root/'README.md',
  root/'01-source-index.md',
  root/'02-prompt-inventory-and-callgraph.md',
  root/'03-skills-mechanism.md',
  root/'04-agent-team-orchestration.md',
  root/'05-information-flow.md',
  root/'diagrams'/'prompt-asset-map.mmd'
]
missing = [str(p) for p in required if not p.exists()]
if missing:
  raise SystemExit('FAIL missing files:\n' + '\n'.join(missing))
print('PASS')
PY
```
Expected: **FAIL**（缺少目录和文件）

**Step 2: Write minimal implementation**

创建目录与最小骨架（每个文件至少包含标题）。

```markdown
# oh-my-opencode 源码分析

> 占位：后续任务填充内容。
```

**Step 3: Run test to verify it passes**

重复 Step 1 命令。
Expected: **PASS**

**Step 4: Smoke-check tree**

Run:
```bash
ls -R "参考项目/oh-my-opencode-analysis"
```
Expected: 显示 6 个 md 文件与 `diagrams/` 下 6 个 `.mmd`

**Step 5: Commit**

```bash
git add "参考项目/oh-my-opencode-analysis"
git commit -m "docs(analysis): scaffold oh-my-opencode analysis workspace"
```

---

### Task 2: 建立源码索引模板与扫描顺序

**Files:**
- Modify: `参考项目/oh-my-opencode-analysis/01-source-index.md`
- Test: 命令校验（内联 Python）

**Step 1: Write the failing test**

Run:
```bash
python - <<'PY'
from pathlib import Path
p = Path('参考项目/oh-my-opencode-analysis/01-source-index.md')
text = p.read_text(encoding='utf-8')
required = ['## 扫描顺序', '## 索引条目模板', '## 模块索引']
missing = [x for x in required if x not in text]
if missing:
  raise SystemExit('FAIL missing headings: ' + ', '.join(missing))
print('PASS')
PY
```
Expected: **FAIL**

**Step 2: Write minimal implementation**

写入以下结构：

```markdown
# 01 源码索引

## 扫描顺序
1. src/agents
2. src/tools（delegate-task/skill/slashcommand/background-task 优先）
3. src/hooks
4. src/plugin* + src/shared + src/cli
5. docs 与关键 tests 证据补充

## 索引条目模板
- 路径：`...`
- 职责：...
- 关键导出：...
- 公共变量/状态：...
- Prompt 触点：define/compose/inject/route/dispatch/consume
- 上下游：...
- 协同标签：planner/orchestrator/worker/skill/hook/transport

## 模块索引
### src/agents
### src/tools
### src/hooks
### src/plugin*
### src/shared
### src/cli
```

**Step 3: Run test to verify it passes**

重复 Step 1 命令。
Expected: **PASS**

**Step 4: Quick style check**

Run:
```bash
python - <<'PY'
from pathlib import Path
text = Path('参考项目/oh-my-opencode-analysis/01-source-index.md').read_text(encoding='utf-8')
assert text.count('### ') >= 6, 'FAIL module sections insufficient'
print('PASS')
PY
```
Expected: **PASS**

**Step 5: Commit**

```bash
git add "参考项目/oh-my-opencode-analysis/01-source-index.md"
git commit -m "docs(analysis): define source index template and scan order"
```

---

### Task 3: 填充 src/agents 索引（含 Prompt 触点）

**Files:**
- Modify: `参考项目/oh-my-opencode-analysis/01-source-index.md`
- Test: 命令校验（内联 Python）

**Step 1: Write the failing test**

Run:
```bash
python - <<'PY'
from pathlib import Path
text = Path('参考项目/oh-my-opencode-analysis/01-source-index.md').read_text(encoding='utf-8')
count = text.count('`src/agents/')
if count < 15:
  raise SystemExit(f'FAIL agent entries too few: {count}')
if 'Prompt 触点' not in text:
  raise SystemExit('FAIL missing Prompt touchpoint field')
print('PASS')
PY
```
Expected: **FAIL**

**Step 2: Write minimal implementation**

按模板补齐 `src/agents/**` 核心文件条目，至少覆盖：
- `src/agents/agent-builder.ts`
- `src/agents/dynamic-agent-prompt-builder.ts`
- `src/agents/builtin-agents/*.ts`
- `src/agents/prometheus/*`
- `src/agents/atlas/*`

每个条目必须包含 `Prompt 触点` 与 `上下游`。

**Step 3: Run test to verify it passes**

重复 Step 1 命令。
Expected: **PASS**

**Step 4: Evidence spot-check**

Run:
```bash
python - <<'PY'
from pathlib import Path
text = Path('参考项目/oh-my-opencode-analysis/01-source-index.md').read_text(encoding='utf-8')
required = ['dynamic-agent-prompt-builder.ts', 'prompt-section-builder.ts', 'plan-template.ts']
missing = [x for x in required if x not in text]
if missing:
  raise SystemExit('FAIL missing key agent files: ' + ', '.join(missing))
print('PASS')
PY
```
Expected: **PASS**

**Step 5: Commit**

```bash
git add "参考项目/oh-my-opencode-analysis/01-source-index.md"
git commit -m "docs(analysis): index src/agents prompt-related files"
```

---

### Task 4: 填充 src/tools 索引（重点 delegate-task/skill/slashcommand）

**Files:**
- Modify: `参考项目/oh-my-opencode-analysis/01-source-index.md`
- Test: 命令校验（内联 Python）

**Step 1: Write the failing test**

Run:
```bash
python - <<'PY'
from pathlib import Path
text = Path('参考项目/oh-my-opencode-analysis/01-source-index.md').read_text(encoding='utf-8')
required = ['`src/tools/delegate-task/', '`src/tools/skill/', '`src/tools/slashcommand/', '`src/tools/background-task/']
missing = [x for x in required if x not in text]
if missing:
  raise SystemExit('FAIL missing tool groups: ' + ', '.join(missing))
if text.count('`src/tools/') < 30:
  raise SystemExit('FAIL tool entries too few')
print('PASS')
PY
```
Expected: **FAIL**

**Step 2: Write minimal implementation**

补齐工具层条目，至少覆盖：
- delegate-task（prompt-builder、executor、subagent-resolver、category-resolver）
- skill（constants/types/tools）
- slashcommand（converter/discovery/tool）
- background-task（create/poller/result-format）

**Step 3: Run test to verify it passes**

重复 Step 1 命令。
Expected: **PASS**

**Step 4: Prompt-edge sanity check**

Run:
```bash
python - <<'PY'
from pathlib import Path
text = Path('参考项目/oh-my-opencode-analysis/01-source-index.md').read_text(encoding='utf-8')
for edge in ['define', 'compose', 'inject', 'route', 'dispatch', 'consume']:
  if edge not in text:
    raise SystemExit(f'FAIL missing edge type mention: {edge}')
print('PASS')
PY
```
Expected: **PASS**

**Step 5: Commit**

```bash
git add "参考项目/oh-my-opencode-analysis/01-source-index.md"
git commit -m "docs(analysis): index tool layer and prompt dispatch points"
```

---

### Task 5: 填充 hooks/plugin/shared/cli 索引

**Files:**
- Modify: `参考项目/oh-my-opencode-analysis/01-source-index.md`
- Test: 命令校验（内联 Python）

**Step 1: Write the failing test**

Run:
```bash
python - <<'PY'
from pathlib import Path
text = Path('参考项目/oh-my-opencode-analysis/01-source-index.md').read_text(encoding='utf-8')
required = ['`src/hooks/', '`src/plugin/', '`src/shared/', '`src/cli/']
missing = [x for x in required if x not in text]
if missing:
  raise SystemExit('FAIL missing module groups: ' + ', '.join(missing))
print('PASS')
PY
```
Expected: **FAIL**

**Step 2: Write minimal implementation**

补齐：
- hooks：context 注入、todo continuation、session recovery、atlas/think-mode
- plugin：hook 组装、tool 前后处理、skill context
- shared：model availability/resolver/session utils
- cli：run 流程与 event handlers

**Step 3: Run test to verify it passes**

重复 Step 1 命令。
Expected: **PASS**

**Step 4: Coverage check**

Run:
```bash
python - <<'PY'
from pathlib import Path
text = Path('参考项目/oh-my-opencode-analysis/01-source-index.md').read_text(encoding='utf-8')
if text.count('### src/') < 6:
  raise SystemExit('FAIL top module sections too few')
print('PASS')
PY
```
Expected: **PASS**

**Step 5: Commit**

```bash
git add "参考项目/oh-my-opencode-analysis/01-source-index.md"
git commit -m "docs(analysis): complete index for hooks plugin shared cli"
```

---

### Task 6: 生成 Prompt 资产清单

**Files:**
- Modify: `参考项目/oh-my-opencode-analysis/02-prompt-inventory-and-callgraph.md`
- Modify: `参考项目/oh-my-opencode-analysis/diagrams/prompt-asset-map.mmd`
- Test: 命令校验（内联 Python）

**Step 1: Write the failing test**

Run:
```bash
python - <<'PY'
from pathlib import Path
p = Path('参考项目/oh-my-opencode-analysis/02-prompt-inventory-and-callgraph.md')
text = p.read_text(encoding='utf-8')
required = ['## Prompt 资产总览', '## 模板分类统计', '## 来源路径清单']
missing = [x for x in required if x not in text]
if missing:
  raise SystemExit('FAIL missing headings: ' + ', '.join(missing))
print('PASS')
PY
```
Expected: **FAIL**

**Step 2: Write minimal implementation**

写入：
- Prompt 模板分类（agent/system/hook/skill/category/tool）
- 每类数量统计与样例路径
- `prompt-asset-map.mmd` 节点：Template Source / Builder / Injector / Dispatcher

**Step 3: Run test to verify it passes**

重复 Step 1 命令。
Expected: **PASS**

**Step 4: Diagram syntax check**

Run:
```bash
python - <<'PY'
from pathlib import Path
text = Path('参考项目/oh-my-opencode-analysis/diagrams/prompt-asset-map.mmd').read_text(encoding='utf-8')
if 'graph' not in text and 'flowchart' not in text:
  raise SystemExit('FAIL invalid mermaid root')
print('PASS')
PY
```
Expected: **PASS**

**Step 5: Commit**

```bash
git add "参考项目/oh-my-opencode-analysis/02-prompt-inventory-and-callgraph.md" "参考项目/oh-my-opencode-analysis/diagrams/prompt-asset-map.mmd"
git commit -m "docs(analysis): add prompt inventory and asset map"
```

---

### Task 7: 构建 Prompt 调用关系图与生命周期图

**Files:**
- Modify: `参考项目/oh-my-opencode-analysis/02-prompt-inventory-and-callgraph.md`
- Modify: `参考项目/oh-my-opencode-analysis/diagrams/prompt-lifecycle-sequence.mmd`
- Modify: `参考项目/oh-my-opencode-analysis/diagrams/model-routing-decision-tree.mmd`
- Test: 命令校验（内联 Python）

**Step 1: Write the failing test**

Run:
```bash
python - <<'PY'
from pathlib import Path
doc = Path('参考项目/oh-my-opencode-analysis/02-prompt-inventory-and-callgraph.md').read_text(encoding='utf-8')
for edge in ['define', 'compose', 'inject', 'route', 'dispatch', 'consume']:
  if edge not in doc:
    raise SystemExit(f'FAIL missing edge type: {edge}')
print('PASS')
PY
```
Expected: **FAIL**

**Step 2: Write minimal implementation**

补齐：
- 边类型定义表
- 主调用关系图（至少覆盖 agents/tools/hooks/plugin）
- 生命周期时序图与模型路由决策树图

**Step 3: Run test to verify it passes**

重复 Step 1 命令。
Expected: **PASS**

**Step 4: Evidence check**

Run:
```bash
python - <<'PY'
from pathlib import Path
doc = Path('参考项目/oh-my-opencode-analysis/02-prompt-inventory-and-callgraph.md').read_text(encoding='utf-8')
if doc.count(':') < 20:
  raise SystemExit('FAIL evidence anchors too few (need file:line style references)')
print('PASS')
PY
```
Expected: **PASS**（补充足够路径锚点后）

**Step 5: Commit**

```bash
git add "参考项目/oh-my-opencode-analysis/02-prompt-inventory-and-callgraph.md" "参考项目/oh-my-opencode-analysis/diagrams/prompt-lifecycle-sequence.mmd" "参考项目/oh-my-opencode-analysis/diagrams/model-routing-decision-tree.mmd"
git commit -m "docs(analysis): map prompt callgraph and lifecycle"
```

---

### Task 8: 深挖 Skills 机制

**Files:**
- Modify: `参考项目/oh-my-opencode-analysis/03-skills-mechanism.md`
- Modify: `参考项目/oh-my-opencode-analysis/diagrams/skill-execution-pipeline.mmd`
- Test: 命令校验（内联 Python）

**Step 1: Write the failing test**

Run:
```bash
python - <<'PY'
from pathlib import Path
doc = Path('参考项目/oh-my-opencode-analysis/03-skills-mechanism.md').read_text(encoding='utf-8')
required = ['## 发现机制', '## 加载与合并', '## 执行流程', '## 与 slashcommand 的关系', '## 失败与回退']
missing = [x for x in required if x not in doc]
if missing:
  raise SystemExit('FAIL missing sections: ' + ', '.join(missing))
print('PASS')
PY
```
Expected: **FAIL**

**Step 2: Write minimal implementation**

覆盖并举证：
- skill discovery / loader / merger / resolver
- skill tool 的输入输出与参数路径
- slashcommand -> skill 转换链路
- 失败分支与保护机制

**Step 3: Run test to verify it passes**

重复 Step 1 命令。
Expected: **PASS**

**Step 4: Diagram sanity check**

Run:
```bash
python - <<'PY'
from pathlib import Path
d = Path('参考项目/oh-my-opencode-analysis/diagrams/skill-execution-pipeline.mmd').read_text(encoding='utf-8')
required = ['discover', 'resolve', 'invoke', 'result']
for token in required:
  if token not in d.lower():
    raise SystemExit(f'FAIL diagram missing token: {token}')
print('PASS')
PY
```
Expected: **PASS**

**Step 5: Commit**

```bash
git add "参考项目/oh-my-opencode-analysis/03-skills-mechanism.md" "参考项目/oh-my-opencode-analysis/diagrams/skill-execution-pipeline.mmd"
git commit -m "docs(analysis): document skills discovery-load-execution pipeline"
```

---

### Task 9: 深挖多 Agent 编排与团队协作流程

**Files:**
- Modify: `参考项目/oh-my-opencode-analysis/04-agent-team-orchestration.md`
- Modify: `参考项目/oh-my-opencode-analysis/diagrams/agent-orchestration-sequence.mmd`
- Modify: `参考项目/oh-my-opencode-analysis/diagrams/resilience-loop.mmd`
- Test: 命令校验（内联 Python）

**Step 1: Write the failing test**

Run:
```bash
python - <<'PY'
from pathlib import Path
doc = Path('参考项目/oh-my-opencode-analysis/04-agent-team-orchestration.md').read_text(encoding='utf-8')
required = ['## 角色分层', '## 调度决策点', '## 并行与重试', '## 续跑与恢复', '## 端到端场景复盘']
missing = [x for x in required if x not in doc]
if missing:
  raise SystemExit('FAIL missing sections: ' + ', '.join(missing))
print('PASS')
PY
```
Expected: **FAIL**

**Step 2: Write minimal implementation**

补齐并举证：
- planner / orchestrator / worker / support 分层
- category 与模型路由关系
- background-agent / task-poller / retry / continuation / todo 机制
- 1 条完整端到端时序复盘（用户输入到子 agent 结果回收）

**Step 3: Run test to verify it passes**

重复 Step 1 命令。
Expected: **PASS**

**Step 4: Sequence diagram check**

Run:
```bash
python - <<'PY'
from pathlib import Path
d = Path('参考项目/oh-my-opencode-analysis/diagrams/agent-orchestration-sequence.mmd').read_text(encoding='utf-8').lower()
if 'sequencediagram' not in d:
  raise SystemExit('FAIL use sequenceDiagram for orchestration timeline')
print('PASS')
PY
```
Expected: **PASS**

**Step 5: Commit**

```bash
git add "参考项目/oh-my-opencode-analysis/04-agent-team-orchestration.md" "参考项目/oh-my-opencode-analysis/diagrams/agent-orchestration-sequence.mmd" "参考项目/oh-my-opencode-analysis/diagrams/resilience-loop.mmd"
git commit -m "docs(analysis): capture multi-agent orchestration and resilience loops"
```

---

### Task 10: 编写信息流总览（Prompt/控制/状态）

**Files:**
- Modify: `参考项目/oh-my-opencode-analysis/05-information-flow.md`
- Test: 命令校验（内联 Python）

**Step 1: Write the failing test**

Run:
```bash
python - <<'PY'
from pathlib import Path
doc = Path('参考项目/oh-my-opencode-analysis/05-information-flow.md').read_text(encoding='utf-8')
required = ['## Prompt 信息流', '## 控制流', '## 状态流', '## 关键断点与观测点']
missing = [x for x in required if x not in doc]
if missing:
  raise SystemExit('FAIL missing sections: ' + ', '.join(missing))
print('PASS')
PY
```
Expected: **FAIL**

**Step 2: Write minimal implementation**

补齐：
- 输入→上下文注入→路由→分发→消费→回传全链
- 控制流决策点（技能触发、模型选择、并行/串行）
- 状态流（session/task/todo/resume）

**Step 3: Run test to verify it passes**

重复 Step 1 命令。
Expected: **PASS**

**Step 4: Traceability check**

Run:
```bash
python - <<'PY'
from pathlib import Path
doc = Path('参考项目/oh-my-opencode-analysis/05-information-flow.md').read_text(encoding='utf-8')
if doc.count('`src/') < 15:
  raise SystemExit('FAIL evidence path anchors too few')
print('PASS')
PY
```
Expected: **PASS**

**Step 5: Commit**

```bash
git add "参考项目/oh-my-opencode-analysis/05-information-flow.md"
git commit -m "docs(analysis): add prompt/control/state information flow"
```

---

### Task 11: 总装 README 与跨文档导航

**Files:**
- Modify: `参考项目/oh-my-opencode-analysis/README.md`
- Test: 命令校验（内联 Python）

**Step 1: Write the failing test**

Run:
```bash
python - <<'PY'
from pathlib import Path
root = Path('参考项目/oh-my-opencode-analysis')
readme = root/'README.md'
text = readme.read_text(encoding='utf-8')
required_links = [
  '01-source-index.md',
  '02-prompt-inventory-and-callgraph.md',
  '03-skills-mechanism.md',
  '04-agent-team-orchestration.md',
  '05-information-flow.md',
  'diagrams/prompt-asset-map.mmd'
]
missing = [x for x in required_links if x not in text]
if missing:
  raise SystemExit('FAIL missing links: ' + ', '.join(missing))
print('PASS')
PY
```
Expected: **FAIL**

**Step 2: Write minimal implementation**

README 必含：
- 目标与范围
- 快速结论（3-5 条）
- 文档导航
- 图谱导航
- 复核指引（`file:line` 规则）

**Step 3: Run test to verify it passes**

重复 Step 1 命令。
Expected: **PASS**

**Step 4: Broken-link check**

Run:
```bash
python - <<'PY'
from pathlib import Path
root = Path('参考项目/oh-my-opencode-analysis')
for rel in [
  '01-source-index.md',
  '02-prompt-inventory-and-callgraph.md',
  '03-skills-mechanism.md',
  '04-agent-team-orchestration.md',
  '05-information-flow.md',
  'diagrams/prompt-asset-map.mmd',
  'diagrams/prompt-lifecycle-sequence.mmd',
  'diagrams/skill-execution-pipeline.mmd',
  'diagrams/agent-orchestration-sequence.mmd',
  'diagrams/model-routing-decision-tree.mmd',
  'diagrams/resilience-loop.mmd',
]:
  p = root / rel
  if not p.exists():
    raise SystemExit(f'FAIL missing linked file: {rel}')
print('PASS')
PY
```
Expected: **PASS**

**Step 5: Commit**

```bash
git add "参考项目/oh-my-opencode-analysis/README.md"
git commit -m "docs(analysis): assemble master readme with navigation"
```

---

### Task 12: 最终验收检查与收尾

**Files:**
- Modify: `参考项目/oh-my-opencode-analysis/README.md`（仅当修复验收问题时）
- Modify: `参考项目/oh-my-opencode-analysis/*.md`（按验收结果最小修补）
- Test: 统一验收脚本（内联 Python）

**Step 1: Write the failing test**

Run:
```bash
python - <<'PY'
from pathlib import Path
root = Path('参考项目/oh-my-opencode-analysis')
required = [
  'README.md',
  '01-source-index.md',
  '02-prompt-inventory-and-callgraph.md',
  '03-skills-mechanism.md',
  '04-agent-team-orchestration.md',
  '05-information-flow.md',
]
for rel in required:
  text = (root/rel).read_text(encoding='utf-8')
  if 'TODO' in text:
    raise SystemExit(f'FAIL unresolved TODO in {rel}')
print('PASS')
PY
```
Expected: 可能 **FAIL**（若仍有占位）

**Step 2: Write minimal implementation**

清理所有占位符、补全缺失证据锚点、修复不一致术语。

**Step 3: Run full verification**

Run:
```bash
python - <<'PY'
from pathlib import Path
root = Path('参考项目/oh-my-opencode-analysis')
# 1) required files
required = [
  'README.md','01-source-index.md','02-prompt-inventory-and-callgraph.md',
  '03-skills-mechanism.md','04-agent-team-orchestration.md','05-information-flow.md'
]
for rel in required:
  p = root/rel
  if not p.exists():
    raise SystemExit(f'FAIL missing file: {rel}')
# 2) evidence anchors
for rel in required[1:]:
  text = (root/rel).read_text(encoding='utf-8')
  if text.count('`src/') < 10:
    raise SystemExit(f'FAIL insufficient source anchors: {rel}')
# 3) diagrams
for rel in [
  'diagrams/prompt-asset-map.mmd',
  'diagrams/prompt-lifecycle-sequence.mmd',
  'diagrams/skill-execution-pipeline.mmd',
  'diagrams/agent-orchestration-sequence.mmd',
  'diagrams/model-routing-decision-tree.mmd',
  'diagrams/resilience-loop.mmd',
]:
  p = root/rel
  if not p.exists():
    raise SystemExit(f'FAIL missing diagram: {rel}')
print('PASS all acceptance checks')
PY
```
Expected: **PASS all acceptance checks**

**Step 4: Request review**

执行：`@superpowers:requesting-code-review`，对照设计文档 `docs/plans/2026-02-19-oh-my-opencode-analysis-design.md` 做一致性复核。

**Step 5: Commit**

```bash
git add "参考项目/oh-my-opencode-analysis"
git commit -m "docs(analysis): finalize oh-my-opencode source analysis deliverables"
```

---

## Done Criteria

- 6 个主文档 + 6 个图谱文件全部完成且互相可导航；
- Prompt 六类边（define/compose/inject/route/dispatch/consume）全部落地；
- Skills 机制与多 Agent 编排各有完整闭环；
- 验收脚本通过且无 TODO 占位。
