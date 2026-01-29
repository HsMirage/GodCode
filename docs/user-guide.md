# CodeAll User Guide

Welcome to **CodeAll**, a powerful multi-LLM collaborative programming platform designed to orchestrate complex coding tasks using multiple AI models and agents.

## 1. Getting Started

### Prerequisites

- Node.js (LTS version recommended)
- PNPM (Package Manager)
- PostgreSQL (Embedded in dev, requires setup for production)
- API Keys for supported LLMs (Anthropic, OpenAI, etc.)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start the development server:
   ```bash
   pnpm dev
   ```

## 2. Configuration

### Setting up LLMs

CodeAll supports multiple LLM providers. To configure them:

1. Navigate to **Settings** > **Models**.
2. Click **Add Model**.
3. Select your provider (Anthropic, OpenAI, Gemini).
4. Enter your API Key and optional Base URL.
5. Save the configuration.

_Note: You must have at least one active model to start a chat session._

## 3. Core Features

### 3.1 Spaces & Sessions

- **Spaces**: Isolated working environments. Each space corresponds to a working directory on your file system.
- **Sessions**: Chat threads within a space. Multiple sessions can exist in one space, sharing context.

### 3.2 Workforce Engine

The Workforce Engine automatically decomposes complex user requests into smaller, manageable tasks.

- **Auto-Decomposition**: Just state your high-level goal (e.g., "Build a React todo app").
- **Parallel Execution**: Agents work on sub-tasks simultaneously.

### 3.3 AI Browser

Integrated BrowserView for web automation.

- **Navigation**: Agents can browse docs and gather info.
- **Interaction**: Click, type, and capture screenshots.
- **Tools**: `browser:navigate`, `browser:click`, `browser:fill`, etc.

### 3.4 Artifact Management

Generated code and files are stored as artifacts.

- View, download, or apply changes directly to your workspace.
- Access artifacts from the chat interface.

## 4. Basic Workflow

1. **Create a Space**: Select a local directory for your project.
2. **Start a Session**: Open a new chat.
3. **Prompt**: "Create a Next.js landing page."
4. **Monitor**: Watch the Workforce Engine break down tasks.
5. **Review**: Check generated files in the Artifacts panel.

## 5. Troubleshooting

- **Database Connection**: Ensure no other process is using the Postgres port.
- **API Errors**: Verify your API keys in Settings.
- **Logs**: Check the application logs in the `logs` directory for detailed error messages.
