# 开发者指南 (Development Guide)

本文档旨在帮助开发者了解 CodeAll 的开发环境配置、项目结构、贡献准则及调试技巧。

## 1. 环境准备

在开始之前，请确保您的开发环境满足以下要求：

- **Node.js**: v20.0.0 或更高版本
- **pnpm**: v10.0.0 或更高版本 (推荐使用 `npm install -g pnpm` 安装)
- **Git**: 用于版本控制
- **操作系统**: Windows 10+, macOS, 或主流 Linux 发行版

## 2. 快速上手

### 2.1 安装依赖

克隆仓库后，在根目录下运行：

```bash
pnpm install
```

_注意：安装过程中会自动下载 `embedded-postgres` 二进制文件以支持嵌入式数据库。_

### 2.2 初始化数据库

生成 Prisma 客户端：

```bash
pnpm prisma generate
```

### 2.3 开发模式运行

启动开发服务器（支持热重载）：

```bash
pnpm dev
```

- **Renderer (Vite)**: 运行在 `http://localhost:5173`
- **Main Process**: 自动启动 Electron 窗口
- **Database**: 嵌入式 PostgreSQL 自动启动

## 3. 代码结构说明

```text
CodeAll/
├── src/
│   ├── main/           # Electron 主进程
│   │   ├── ipc/        # IPC 通讯处理逻辑与验证器
│   │   ├── services/   # 核心业务服务 (LLM 适配器, 任务引擎, 浏览器自动化)
│   │   └── index.ts    # 主进程入口
│   ├── preload/        # 预加载脚本 (Context Bridge)
│   ├── renderer/       # 前端界面 (React + Vite)
│   │   ├── src/        # 页面、组件、Hooks、Store
│   │   └── index.html  # 页面入口
│   └── shared/         # 主进程与渲染进程共享的代码 (类型定义, 工具类)
├── prisma/             # 数据库模型 (schema.prisma)
├── docs/               # 技术文档
├── tests/              # 测试用例 (Vitest, Playwright)
└── electron.vite.config.ts # 构建配置文件
```

## 4. 构建流程

### 生产环境编译

```bash
# 执行完整构建（前端编译 + Electron 打包准备）
pnpm build

# 针对特定平台打包
pnpm build:win    # 构建 Windows 安装程序 (NSIS)
pnpm build:linux  # 构建 Linux AppImage/deb
pnpm build:mac    # 构建 macOS 应用
```

构建产物将存放在 `out/` (编译代码) 和 `dist/` (安装包) 目录中。

## 5. 代码风格与规范

- **TypeScript**: 必须使用严格模式。尽量避免使用 `any`，优先定义接口或类型。
- **Linting & Formatting**: 项目使用 ESLint 和 Prettier 保持代码风格统一。
  - 检查代码：`pnpm lint`
  - 格式化代码：`pnpm format`
- **组件规范**: 优先使用函数式组件和 Hooks。样式采用 Tailwind CSS。

## 6. 贡献指南 (PR 流程)

1. **创建分支**: 从 `main` 分支创建新的功能分支 (`feature/your-feature`) 或修复分支 (`fix/your-fix`)。
2. **本地测试**: 在提交前确保所有测试通过 (`pnpm test`) 且无类型错误 (`pnpm typecheck`)。
3. **提交规范**: 建议遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。
4. **发起 PR**: 提交到远程仓库后发起 Pull Request，并详细描述更改内容。
5. **代码审查**: 等待维护者审查并处理反馈意见。

## 7. 调试技巧

- **渲染进程调试**: 在 Electron 窗口中按 `Ctrl+Shift+I` (Windows/Linux) 或 `Cmd+Option+I` (macOS) 打开开发者工具。
- **主进程调试**: 查看终端输出的日志，或通过 `app-stdout.log` 查看持久化日志。
- **数据库调试**: 使用 Prisma Studio 可视化查看本地数据库：
  ```bash
  npx prisma studio
  ```
- **日志记录**: 核心逻辑中使用 `LoggerService` 记录关键信息，日志文件存放在应用数据目录的 `logs` 文件夹下。

---

Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-opencode)
Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>
