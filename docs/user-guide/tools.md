# 工具使用指南

CodeAll 提供了丰富的工具集，让 AI 能够与文件系统、终端、浏览器和网络进行交互。本文档详细介绍每个工具的功能和使用方法。

## 目录

- [工具概述](#工具概述)
- [文件操作工具](#文件操作工具)
- [终端工具](#终端工具)
- [搜索工具](#搜索工具)
- [网络工具](#网络工具)
- [浏览器工具](#浏览器工具)
- [工具权限](#工具权限)

---

## 工具概述

CodeAll 的工具分为以下几类:

| 类别 | 工具数量 | 说明 |
|------|----------|------|
| 文件操作 | 3 | 读取、写入、列出文件 |
| 终端 | 1 | 执行 bash 命令 |
| 搜索 | 2 | grep 内容搜索、glob 模式匹配 |
| 网络 | 2 | 网页获取、网络搜索 |
| 浏览器 | 6 | 浏览器自动化操作 |

---

## 文件操作工具

### file_read - 读取文件

读取指定路径文件的内容。

**参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| path | string | ✓ | 文件路径 (相对于工作空间) |

**返回**: 文件内容文本

**示例对话**:
```
用户: 看看 package.json 的内容

AI: [调用 file_read: path="package.json"]

    文件内容如下:
    {
      "name": "my-project",
      "version": "1.0.0",
      ...
    }
```

**注意事项**:
- 路径必须在工作空间目录内
- 尝试访问工作空间外的路径会被拒绝
- 支持文本文件，二进制文件可能无法正确显示

---

### file_write - 写入文件

将内容写入指定路径的文件。如果文件不存在会创建，存在则覆盖。

**参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| path | string | ✓ | 文件路径 (相对于工作空间) |
| content | string | ✓ | 要写入的内容 |

**返回**: 成功消息，包含文件路径和大小

**示例对话**:
```
用户: 创建一个 README.md 文件

AI: [调用 file_write: path="README.md", content="# My Project\n\n..."]

    文件已创建: README.md
    大小: 256 bytes
```

**注意事项**:
- 会自动创建不存在的目录
- 写入操作会产生 diff 记录
- 路径必须在工作空间目录内

---

### file_list - 列出文件

列出指定目录下的文件和子目录。

**参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| path | string | ✓ | 目录路径 (相对于工作空间) |

**返回**: 文件和目录列表

**示例对话**:
```
用户: 列出 src 目录下的文件

AI: [调用 file_list: path="src"]

    src 目录结构:
    ├── main/
    ├── renderer/
    ├── shared/
    └── preload/
```

---

## 终端工具

### bash - 执行命令

在工作空间目录中执行 bash/shell 命令。

**参数**:
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| command | string | ✓ | - | 要执行的命令 |
| description | string | | - | 命令描述 |
| timeout | number | | 120000 | 超时时间 (毫秒) |
| cwd | string | | . | 工作目录 |
| run_in_background | boolean | | false | 后台执行 |

**返回**: 命令输出 (stdout/stderr)

**示例对话**:
```
用户: 运行项目测试

AI: [调用 bash: command="pnpm test", description="运行单元测试"]

    测试输出:
    ✓ test/auth.test.ts (12 tests)
    ✓ test/api.test.ts (8 tests)

    全部 20 个测试通过
```

**超时控制**:
- 默认超时: 120 秒 (2 分钟)
- 最大超时: 600 秒 (10 分钟)
- 超时后进程会被终止

**后台执行**:
```
用户: 在后台启动开发服务器

AI: [调用 bash: command="pnpm dev", run_in_background=true]

    后台进程已启动:
    - Process ID: bg_1234_abc
    - PID: 12345
    - Command: pnpm dev
```

**安全限制**:

以下命令会被**阻止**:
- `rm -rf /` - 删除根目录
- `dd if=/dev/zero` - 磁盘写入
- `mkfs` - 格式化
- `shutdown`, `reboot` - 系统操作

以下命令会**警告**:
- `git push --force` - 强制推送
- `git reset --hard` - 硬重置
- `git clean -f` - 强制清理

---

## 搜索工具

### grep - 内容搜索

在文件中搜索匹配的文本模式。

**参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| pattern | string | ✓ | 搜索模式 (正则表达式) |
| path | string | | 搜索路径，默认为工作空间 |
| glob | string | | 文件过滤 glob 模式 |
| type | string | | 文件类型 (js, ts, py 等) |
| context | number | | 显示匹配行的上下文行数 |
| caseSensitive | boolean | | 区分大小写 |

**返回**: 匹配结果列表 (文件、行号、内容)

**示例对话**:
```
用户: 搜索所有使用 console.log 的地方

AI: [调用 grep: pattern="console.log", type="ts"]

    找到 15 处匹配:

    src/main/index.ts:23
      console.log('App started')

    src/renderer/App.tsx:45
      console.log('Component mounted')

    ...
```

**高级搜索**:
```
用户: 搜索 TypeScript 文件中的 async 函数定义

AI: [调用 grep: pattern="async function", glob="**/*.ts", context=2]

    匹配结果 (带上下文):

    src/services/auth.ts:10-14
      // 用户认证
      async function authenticate(user, pass) {
        const result = await api.login(user, pass)
```

---

### glob - 文件模式匹配

根据 glob 模式查找文件。

**参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| pattern | string | ✓ | Glob 模式 |
| path | string | | 搜索起始路径 |
| ignore | string[] | | 忽略的模式 |

**返回**: 匹配的文件路径列表

**常用 Glob 模式**:
| 模式 | 匹配 |
|------|------|
| `*.ts` | 当前目录所有 .ts 文件 |
| `**/*.ts` | 递归所有 .ts 文件 |
| `src/**/*.tsx` | src 目录下所有 .tsx 文件 |
| `*.{js,ts}` | 所有 .js 和 .ts 文件 |
| `!node_modules/**` | 排除 node_modules |

**示例对话**:
```
用户: 找出所有 React 组件文件

AI: [调用 glob: pattern="**/*.tsx"]

    找到 45 个组件文件:
    - src/components/App.tsx
    - src/components/Button.tsx
    - src/components/Header.tsx
    - src/pages/Home.tsx
    ...
```

---

## 网络工具

### webfetch - 网页获取

获取指定 URL 的网页内容。

**参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| url | string | ✓ | 目标 URL |
| prompt | string | ✓ | 处理提示 (指导如何处理内容) |

**返回**: 处理后的网页内容

**示例对话**:
```
用户: 获取 React 官方文档的 hooks 页面内容

AI: [调用 webfetch:
     url="https://react.dev/reference/react/hooks",
     prompt="提取主要的 hooks 列表和描述"]

    React Hooks 列表:

    状态 Hooks:
    - useState: 管理组件状态
    - useReducer: 复杂状态逻辑

    Effect Hooks:
    - useEffect: 副作用处理
    - useLayoutEffect: 同步副作用
    ...
```

**注意事项**:
- HTTP 会自动升级为 HTTPS
- 内容会被转换为 Markdown 格式
- 大内容可能被截断

---

### websearch - 网络搜索

执行网络搜索获取信息。

**参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| query | string | ✓ | 搜索查询 |
| limit | number | | 结果数量限制 |

**返回**: 搜索结果列表

**示例对话**:
```
用户: 搜索 Node.js 20 的新特性

AI: [调用 websearch: query="Node.js 20 new features 2024"]

    搜索结果:

    1. Node.js 20 Release Notes
       https://nodejs.org/en/blog/release/v20.0.0
       Node.js 20 带来了稳定的 test runner...

    2. What's New in Node.js 20
       https://blog.example.com/nodejs-20
       主要更新包括...
```

---

## 浏览器工具

CodeAll 包含一套完整的浏览器自动化工具，用于网页交互和测试。

### browser_navigate - 页面导航

导航到指定 URL。

**参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| url | string | ✓ | 目标 URL |

**示例**:
```
AI: [调用 browser_navigate: url="http://localhost:3000"]
    已导航到: http://localhost:3000
```

---

### browser_click - 点击元素

点击页面上的指定元素。

**参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| selector | string | ✓ | CSS 选择器 |

**示例**:
```
AI: [调用 browser_click: selector="button.submit"]
    已点击: button.submit
```

---

### browser_fill - 填写表单

在输入框中填写内容。

**参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| selector | string | ✓ | 输入框的 CSS 选择器 |
| value | string | ✓ | 要填写的值 |

**示例**:
```
AI: [调用 browser_fill: selector="#email", value="user@example.com"]
    已填写: #email = "user@example.com"
```

---

### browser_snapshot - 页面快照

获取当前页面的可访问性快照。

**参数**: 无

**返回**: 页面元素的结构化描述

**用途**: 用于理解页面结构，不需要截图

---

### browser_screenshot - 页面截图

截取当前页面的图片。

**参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| fullPage | boolean | | 是否截取整页 |

**返回**: 截图图片

---

### browser_extract - 内容提取

从页面提取指定内容。

**参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| selector | string | ✓ | CSS 选择器 |
| attribute | string | | 要提取的属性 |

**返回**: 提取的内容

---

## 工具权限

### Agent 工具权限表

不同 Agent 可使用的工具不同:

| Agent | 文件读 | 文件写 | bash | grep | glob | 网络 | 浏览器 |
|-------|:------:|:------:|:----:|:----:|:----:|:----:|:------:|
| 鲁班 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 昊天 | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| 夸父 | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| 伏羲 | ✓ | ✓ | ✓ | | | ✓ | |
| 白泽 | ✓ | | | ✓ | ✓ | | |
| 千里眼 | ✓ | | | ✓ | ✓ | | |
| 谛听 | | | | | | ✓ | |

### 工具执行策略

工具执行有以下策略:

1. **自动允许**: 只读操作通常自动允许
2. **需要确认**: 写入操作可能需要用户确认
3. **阻止**: 危险操作会被阻止

可在设置中配置工具执行策略。

---

## 最佳实践

1. **让 AI 选择工具**: 描述你的目标，让 AI 选择合适的工具
2. **提供上下文**: 更多上下文帮助 AI 更好地使用工具
3. **检查结果**: 关注 AI 的工具调用结果，确保符合预期
4. **迭代改进**: 如果结果不理想，提供更多信息让 AI 调整
