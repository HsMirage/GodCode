# CodeAll 快速开始指南

欢迎使用 CodeAll - 多模型协作编程平台。本指南将帮助你快速安装、配置并开始使用 CodeAll。

## 目录

- [系统要求](#系统要求)
- [安装步骤](#安装步骤)
- [首次启动配置](#首次启动配置)
- [创建第一个工作空间](#创建第一个工作空间)
- [开始对话](#开始对话)
- [常用操作](#常用操作)

---

## 系统要求

### 操作系统
- Windows 10/11 (64-bit)
- macOS 10.15+
- Linux (Ubuntu 20.04+, Debian 10+)

### 硬件要求
- 内存: 8GB RAM (推荐 16GB)
- 硬盘: 500MB 可用空间
- 网络: 需要互联网连接调用 LLM API

### 软件依赖
- Node.js 18+ (开发模式)
- pnpm 包管理器 (开发模式)

---

## 安装步骤

### 方式一: 使用预编译版本 (推荐)

1. 从 [Releases 页面](https://github.com/your-repo/codeall/releases) 下载对应平台的安装包
2. 运行安装程序
3. 启动 CodeAll 应用

### 方式二: 从源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/your-repo/codeall.git
cd codeall

# 2. 安装依赖 (需要 pnpm)
pnpm install

# 3. 初始化数据库
pnpm prisma generate

# 4. 启动开发模式
pnpm dev
```

### 构建发布版本

```bash
# Windows
pnpm build:win

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

---

## 首次启动配置

### 1. 配置 API Key

首次启动时，需要配置至少一个 LLM 提供商的 API Key:

1. 打开设置页面 (点击左侧导航栏的设置图标)
2. 选择 "API 密钥" 标签
3. 添加你的 API Key:
   - **OpenAI**: 输入 OpenAI API Key (sk-xxx...)
   - **Anthropic**: 输入 Claude API Key (sk-ant-xxx...)
   - **Google**: 输入 Gemini API Key

> 提示: API Key 会使用系统密钥链加密存储，确保安全。

### 2. 配置模型

在设置页面的 "模型配置" 标签中:

1. 选择提供商 (OpenAI/Anthropic/Google)
2. 选择要使用的模型
3. 可选择设置为默认模型

**推荐模型配置:**

| 用途 | 推荐模型 |
|------|----------|
| 日常编程 | claude-3-5-sonnet / gpt-4o |
| 复杂推理 | claude-3-opus / gpt-4o |
| 快速任务 | claude-3-haiku / gpt-4o-mini |

---

## 创建第一个工作空间

工作空间 (Space) 是 CodeAll 中组织项目的基本单位，对应本地的一个目录。

### 创建工作空间

1. 点击左侧边栏的 "+" 按钮
2. 选择 "打开文件夹"
3. 浏览并选择你的项目目录
4. 工作空间会自动创建并显示在侧边栏

### 工作空间结构

```
工作空间
├── 会话 1 (Session)
│   ├── 消息 1
│   ├── 消息 2
│   └── ...
├── 会话 2
└── ...
```

---

## 开始对话

### 创建新会话

1. 在工作空间中点击 "新建会话" 按钮
2. 输入会话名称 (可选)
3. 开始与 AI 对话

### 发送消息

在输入框中输入你的问题或任务描述，按 Enter 发送。

**示例对话:**

```
用户: 帮我分析这个项目的代码结构

AI: 我来帮你分析项目结构...
    [自动调用 grep、glob 等工具探索代码]

    项目结构分析如下:
    - src/main/: 主进程代码
    - src/renderer/: 渲染进程 (React UI)
    ...
```

### 选择 Agent

不同的 Agent 适合不同类型的任务:

1. 点击输入框上方的 Agent 选择器
2. 选择适合任务的 Agent
3. 开始对话

---

## 常用操作

### 文件操作

AI 可以帮你读取、创建、修改文件:

```
用户: 创建一个新的 React 组件 Button.tsx

AI: 好的，我来创建 Button 组件...
    [调用 file_write 工具]
    文件已创建: src/components/Button.tsx
```

### 代码搜索

快速搜索代码库中的内容:

```
用户: 找出所有使用了 useState 的文件

AI: 我来搜索项目中使用 useState 的文件...
    [调用 grep 工具]
    找到以下文件使用了 useState:
    - src/components/App.tsx
    - src/hooks/useAuth.ts
    ...
```

### 执行命令

让 AI 帮你执行终端命令:

```
用户: 运行测试

AI: 正在执行测试命令...
    [调用 bash 工具: pnpm test]

    测试结果:
    ✓ 32 tests passed
    ✗ 2 tests failed
    ...
```

### 网络搜索

获取最新的技术信息:

```
用户: 查找 React 19 的新特性

AI: 我来搜索 React 19 的相关信息...
    [调用 websearch 工具]

    React 19 的主要新特性包括:
    1. Actions API
    2. use() hook
    ...
```

---

## 下一步

- 了解 [Agent 系统](./agent-system.md) - 学习如何选择和使用不同的 AI 智能体
- 查看 [工具使用指南](./tools.md) - 了解所有可用的工具
- 阅读 [配置说明](./configuration.md) - 详细的配置选项说明

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + N` | 新建会话 |
| `Ctrl/Cmd + W` | 关闭当前会话 |
| `Ctrl/Cmd + ,` | 打开设置 |
| `Enter` | 发送消息 |
| `Shift + Enter` | 换行 |
| `Escape` | 取消当前操作 |

---

## 获取帮助

如果遇到问题:

1. 查看 [常见问题](./faq.md)
2. 在 GitHub 提交 [Issue](https://github.com/your-repo/codeall/issues)
3. 加入社区讨论
