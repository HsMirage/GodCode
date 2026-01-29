# CodeAll

CodeAll is a multi-LLM collaborative programming platform designed to orchestrate complex software development tasks. It seamlessly integrates local workspaces, diverse AI models, and browser automation into a unified Electron-based environment.

## Key Features

- **Multi-LLM Orchestration**: Simultaneously leverage Anthropic (Claude), OpenAI (GPT-4), and Gemini models.
- **Workforce Engine**: Automatically decomposes high-level goals into executable sub-tasks handled by specialized agents.
- **Workspace Isolation**: Manage distinct projects in isolated "Spaces" mapped to your local file system.
- **AI Browser**: Built-in, agent-controlled web browser for documentation research and web automation.
- **Embedded Database**: Zero-config PostgreSQL database for robust state management.
- **Artifact Management**: Versioned storage for generated code, files, and diffs.

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- [**User Guide**](docs/user-guide.md): Installation, configuration, and basic usage.
- [**API Reference**](docs/api-reference.md): Detailed IPC channel specifications and database schema.
- [**Architecture**](docs/architecture.md): System design, component diagrams, and data flow.
- [**Development Guide**](docs/development.md): Setup instructions for contributors.

## Quick Start

1. **Install Dependencies**

   ```bash
   pnpm install
   ```

2. **Start Development Server**

   ```bash
   pnpm dev
   ```

3. **Build for Production**
   ```bash
   pnpm build
   ```

## Acknowledgments

This project is inspired by the following open-source references:

1. [oh-my-opencode](https://github.com/opencode-ai/oh-my-opencode)
2. [eigent](https://github.com/stackframe-projects/eigent)
3. [hello-halo](https://github.com/openkursar/halo)
4. [moltbot](https://github.com/pashpashpash/moltbot)
5. [ccg-workflow](https://github.com/fengshao1227/ccg-workflow)
