# CodeAll

CodeAll is a next-generation Multi-LLM Collaborative Programming Platform. It empowers developers to orchestrate complex software development tasks by integrating local workspaces, diverse AI models, and browser automation into a unified, high-performance environment.

Built with Electron and React, CodeAll serves as a robust workforce engine that decomposes high-level goals into executable sub-tasks, handled by specialized AI agents.

## 🚀 Key Features

- **Multi-LLM Orchestration**: Simultaneously leverage industry-leading models including Anthropic (Claude), OpenAI (GPT-4), and Google Gemini.
- **Workforce Engine**: Automatically decomposes complex requests into a Directed Acyclic Graph (DAG) of tasks executed by specialized agents.
- **AI-Controlled Browser**: Integrated browser environment allowing agents to perform documentation research, web automation, and E2E testing using Playwright.
- **Workspace Isolation**: Manage distinct projects in isolated "Spaces" mapped directly to your local file system with real-time file tree synchronization.
- **Embedded Database**: Zero-config, embedded PostgreSQL database powered by Prisma ORM for reliable state management and task persistence.
- **Workflow Visualization**: Real-time interactive graph view of agent activities, task dependencies, and execution status.
- **Cross-Platform Delivery**: Native Windows desktop application and a Linux-compatible Web Server mode for remote access.

## 🛠 Tech Stack

- **Runtime**: [Electron](https://www.electronjs.org/) 28+, [Node.js](https://nodejs.org/)
- **Frontend**: [React 18](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Database**: [Prisma](https://www.prisma.io/) + [embedded-postgres](https://github.com/ferrous-systems/embedded-postgres)
- **Build Tooling**: [electron-vite](https://electron-vite.org/), [electron-builder](https://www.electron.build/)
- **Testing**: [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/)

## 🏁 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (v10+)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-repo/codeall.git
   cd codeall
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Initialize Database**
   ```bash
   pnpm prisma generate
   ```

### Running the Application

- **Development Mode** (Desktop):

  ```bash
  pnpm dev
  ```

- **Web Server Mode** (Linux/Remote):
  ```bash
  pnpm start:web
  ```

### Building for Production

- **Windows**:

  ```bash
  pnpm build:win
  ```

- **Linux**:
  ```bash
  pnpm build:linux
  ```

## 📖 Documentation

Detailed documentation is available in the `docs/` directory:

- [**User Guide**](docs/user-guide.md): Configuration, API keys, and basic workflow.
- [**Architecture**](docs/architecture.md): System design, IPC channels, and agent orchestration logic.
- [**Development Guide**](docs/development.md): Coding standards, testing, and contribution workflow.
- [**Agent Guide**](docs/agents.md): How to build and register custom AI agents.

## 🧪 Testing

CodeAll maintains high quality through comprehensive testing:

- **Unit Tests**: `pnpm test`
- **E2E Tests**: `pnpm test:e2e`
- **Performance Tests**: `pnpm test:performance` (Concurrency limits & Multi-agent stability)

## 📜 License

This project is licensed under the **MIT License**.

---

## 🙏 Acknowledgments

CodeAll is inspired by and incorporates ideas from the following open-source projects:

- [oh-my-opencode](https://github.com/opencode-ai/oh-my-opencode): Multi-agent collaborative concepts.
- [eigent](https://github.com/stackframe-projects/eigent): Workforce task decomposition architecture.
- [hello-halo](https://github.com/openkursar/halo): Embedded browser integration.
- [moltbot](https://github.com/pashpashpash/moltbot): Subagent spawning mechanisms.
- [ccg-workflow](https://github.com/fengshao1227/ccg-workflow): Task scheduling philosophy.

---

_Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-opencode)_
