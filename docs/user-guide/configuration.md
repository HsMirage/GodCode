# 配置说明

本文档详细介绍 GodCode 的各项配置选项，包括 API Key 设置、模型配置、Agent 绑定等。

## 目录

- [API Key 配置](#api-key-配置)
- [模型配置](#模型配置)
- [Agent 绑定配置](#agent-绑定配置)
- [工作空间配置](#工作空间配置)
- [应用设置](#应用设置)
- [高级配置](#高级配置)

---

## API Key 配置

GodCode 支持多个 LLM 提供商，需要配置相应的 API Key 才能使用。

### 支持的提供商

| 提供商 | 模型示例 | API Key 格式 |
|--------|----------|--------------|
| OpenAI | gpt-4o, gpt-4o-mini | `sk-...` |
| Anthropic | claude-3-opus, claude-3-5-sonnet | `sk-ant-...` |
| Google | gemini-pro, gemini-1.5-pro | Google Cloud API Key |

### 配置步骤

1. 打开设置页面 (侧边栏设置图标或 `Ctrl/Cmd + ,`)
2. 选择 **"API 密钥"** 标签
3. 点击 **"添加密钥"** 按钮
4. 填写:
   - **提供商**: 选择 OpenAI/Anthropic/Google
   - **密钥名称**: 自定义名称便于识别
   - **API Key**: 粘贴你的 API Key
5. 点击 **"保存"**

### 获取 API Key

**OpenAI:**
1. 访问 [platform.openai.com](https://platform.openai.com)
2. 登录后进入 API Keys 页面
3. 点击 "Create new secret key"
4. 复制生成的 key

**Anthropic:**
1. 访问 [console.anthropic.com](https://console.anthropic.com)
2. 登录后进入 API Keys 页面
3. 创建新的 API Key
4. 复制生成的 key

**Google (Gemini):**
1. 访问 [ai.google.dev](https://ai.google.dev)
2. 进入 Google AI Studio
3. 获取 API Key

### API Key 安全

- API Key 使用系统密钥链加密存储
- Windows: 使用 Windows Credential Manager
- macOS: 使用 Keychain
- Linux: 使用 libsecret

> 安全提示: 永远不要在代码或日志中暴露 API Key

---

## 模型配置

### 添加模型

1. 进入设置 → **"模型配置"** 标签
2. 点击 **"添加模型"**
3. 填写模型信息:

| 字段 | 说明 | 示例 |
|------|------|------|
| 提供商 | 选择已配置 API Key 的提供商 | OpenAI |
| 模型 ID | 模型的 API 标识符 | gpt-4o |
| 显示名称 | 界面显示的名称 | GPT-4o (2024) |
| 上下文长度 | 最大 token 数 | 128000 |
| 默认温度 | 生成创造性 (0-2) | 0.7 |

### 推荐模型配置

**日常开发 (平衡效果和成本):**
```
模型: claude-3-5-sonnet-20240620 或 gpt-4o
温度: 0.3-0.5
上下文: 128K+
```

**复杂推理任务:**
```
模型: claude-3-opus-20240229 或 gpt-4o
温度: 0.2
上下文: 最大可用
```

**快速简单任务:**
```
模型: claude-3-haiku-20240307 或 gpt-4o-mini
温度: 0.3
上下文: 根据需要
```

### 模型参数说明

**温度 (Temperature)**:
- `0.0` - 最确定性，适合代码生成
- `0.3-0.5` - 平衡，适合日常任务
- `0.7-1.0` - 更创造性，适合创意写作
- `1.0+` - 高度随机，慎用

**上下文长度**:
- 决定模型能"记住"多少对话历史
- 更长的上下文 = 更高的成本
- 推荐根据任务复杂度选择

---

## Agent 绑定配置

可以为不同的 Agent 绑定不同的模型，优化效果和成本。

### 配置 Agent 模型绑定

1. 进入设置 → **"Agent 绑定"** 标签
2. 选择 Agent
3. 配置:

| 配置项 | 说明 |
|--------|------|
| 默认模型 | Agent 使用的 LLM 模型 |
| 温度 | 覆盖模型默认温度 |
| 最大 Token | 限制输出长度 |

### 推荐 Agent 模型配置

| Agent | 推荐模型 | 温度 | 说明 |
|-------|----------|------|------|
| 伏羲 (fuxi) | claude-3-opus | 0.3 | 需要深度思考的规划 |
| 昊天 (haotian) | claude-3-5-sonnet | 0.3 | 平衡效果和速度 |
| 鲁班 (luban) | gpt-4o | 0.2 | 全能型，需要稳定输出 |
| 白泽 (baize) | gpt-4o | 0.2 | 代码审查需要精确 |
| 千里眼 (qianliyan) | claude-3-haiku | 0.2 | 快速搜索任务 |
| 谛听 (diting) | claude-3-haiku | 0.3 | 信息检索任务 |

### 任务类别模型配置

| 类别 | 推荐模型 | 温度 |
|------|----------|------|
| 织女 (前端) | gpt-4o | 0.7 |
| 仓颉 (文档) | claude-3-5-sonnet | 0.6 |
| 天兵 (简单) | claude-3-haiku | 0.3 |
| 鬼谷 (推理) | gpt-4o | 0.2 |
| 马良 (创意) | claude-3-5-sonnet | 0.8 |

### 运行时模型命中与回退说明

运行时模型选择按以下优先级解析：

1. 显式覆盖模型（`override`）
2. Agent 绑定（`agent-binding`）
3. 任务类别绑定（`category-binding`）
4. 系统默认模型（`system-default`）

从 `2026-03-06` 起，任务运行面板和 Workflow 节点详情会展示：

- 模型来源：本次最终命中的来源层级
- 命中原因：例如“命中 Agent 绑定 / 命中类别绑定 / 命中系统默认”
- 选择摘要：解释为什么选中了当前模型
- 回退原因：上游绑定未配置、已禁用或未设置模型时的降级原因
- 回退摘要：展示本次模型选择链路中的跳过 / 回退步骤

如果你看到任务落到了系统默认模型，通常意味着上游 Agent/类别绑定没有命中，或已被显式跳过；可直接在任务面板中查看对应回退摘要定位配置问题。

---

## 工作空间配置

### 创建工作空间

1. 点击侧边栏 **"+"** 按钮
2. 选择 **"打开文件夹"**
3. 选择项目目录

### 工作空间设置

每个工作空间可以有独立配置:

```
工作空间设置:
├── 默认 Agent
├── 默认模型
├── 忽略文件/目录
└── 自定义工具权限
```

### 忽略配置

在工作空间根目录创建 `.godcodeignore` 文件:

```
# 忽略 node_modules
node_modules/

# 忽略构建产物
dist/
build/
out/

# 忽略日志
*.log
logs/

# 忽略敏感文件
.env
.env.local
*.pem
*.key
```

---

## 应用设置

### 界面设置

| 设置 | 说明 | 选项 |
|------|------|------|
| 主题 | 界面主题 | 亮色 / 暗色 / 跟随系统 |
| 字体大小 | 编辑器字体大小 | 12-24px |
| 代码高亮 | 语法高亮主题 | Monokai / GitHub / ... |

### 编辑器设置

| 设置 | 说明 | 默认 |
|------|------|------|
| Tab 大小 | 缩进空格数 | 2 |
| 自动保存 | 自动保存修改 | 开启 |
| 换行 | 自动换行 | 开启 |

### 网络设置

| 设置 | 说明 |
|------|------|
| 代理 | HTTP/HTTPS 代理地址 |
| 超时 | API 请求超时时间 |
| 重试 | 失败重试次数 |

### 配置代理

如果需要通过代理访问 API:

```
代理设置:
HTTP 代理: http://127.0.0.1:7890
HTTPS 代理: http://127.0.0.1:7890
```

---

## 高级配置

### 环境变量

可通过环境变量配置部分选项:

```bash
# API 相关
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# 代理
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890

# 日志
LOG_LEVEL=debug
LOG_DIR=/path/to/logs
```

### 配置文件位置

GodCode 的配置文件存储位置:

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%\GodCode\` |
| macOS | `~/Library/Application Support/GodCode/` |
| Linux | `~/.config/GodCode/` |

### 数据库

GodCode 使用嵌入式 PostgreSQL 存储数据:

```
数据目录:
├── db/           # PostgreSQL 数据
├── config.json   # 应用配置
└── logs/         # 日志文件
```

### 日志配置

日志级别:
- `error` - 仅错误
- `warn` - 警告和错误
- `info` - 一般信息 (默认)
- `debug` - 调试信息
- `verbose` - 详细信息

日志文件自动轮转，保留最近 7 天。

### 工具执行策略

配置工具的执行权限:

```json
{
  "tools": {
    "file_write": {
      "policy": "confirm",
      "allowedPaths": ["src/**", "docs/**"]
    },
    "bash": {
      "policy": "confirm",
      "blockedCommands": ["rm -rf", "sudo"]
    }
  }
}
```

策略选项:
- `auto` - 自动执行
- `confirm` - 需要用户确认
- `block` - 阻止执行

---

## 配置导入导出

### 导出配置

1. 设置 → 数据管理 → 导出配置
2. 选择要导出的配置项
3. 保存为 JSON 文件

> 注意: API Key 不会被导出

### 导入配置

1. 设置 → 数据管理 → 导入配置
2. 选择配置文件
3. 确认导入

---

## 故障排除

### API Key 无效

1. 确认 Key 格式正确
2. 检查 Key 是否过期
3. 确认账户有足够余额
4. 尝试重新添加 Key

### 模型不可用

1. 确认提供商 API Key 已配置
2. 检查模型 ID 是否正确
3. 确认你的账户有该模型权限

### 网络错误

1. 检查网络连接
2. 确认代理设置正确
3. 尝试增加超时时间

### 重置配置

如需重置所有配置:

1. 关闭 GodCode
2. 删除配置目录
3. 重新启动

> 警告: 这将删除所有配置和会话数据
