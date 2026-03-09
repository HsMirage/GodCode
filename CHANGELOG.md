# Changelog

All notable changes to GodCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Synced key behavioral updates from oh-my-opencode `v3.5.0` / `v3.5.1` into GodCode orchestration flow:
  - Boulder state now supports OMO-style minimal `boulder.json` payloads (`active_plan`, `session_ids`, `plan_name`, `agent`) with backward-compatible normalization.
  - Task continuation is now gated by active boulder `session_ids`, includes "plan-first" continuation instructions, and deduplicates near-duplicate idle triggers.
  - Agent run completion now ignores duplicate completion calls for terminal runs to prevent repeated completion notifications.
  - Background task manager now classifies non-zero process exits as `interrupt`, emits error channel events for interrupted tasks, and guards terminal-state double completion paths.
- Updated orchestrator prompts:
  - `伏羲(FuXi)` explicitly supports planning-grade `bash` inspection (OMO 3.5.0 parity).
  - `夸父(KuaFu)` enforces manual code review gates and boulder-session continuation guardrails.

## [1.0.0] - 2026-02-09

### Added

#### Core Platform
- Multi-LLM collaborative programming platform built with Electron and React
- Task decomposition engine (Workforce) for breaking complex tasks into sub-tasks
- Delegation engine for routing tasks to specialized AI agents
- Smart router for intelligent model selection based on task complexity

#### AI Agents
- **Baize (白泽)** - Code understanding and architecture analysis
- **Chongming (重明)** - Code review and quality assurance
- **Diting (谛听)** - Error analysis and debugging
- **Fuxi (伏羲)** - Requirements analysis and planning
- **Haotian (昊天)** - Task coordination and orchestration
- **Kuafu (夸父)** - Performance optimization
- **Leigong (雷公)** - Testing and validation
- **Luban (鲁班)** - Code implementation
- **Qianliyan (千里眼)** - Code search and exploration

#### Tools
- **File Operations**: file_read, file_write, file_list
- **Code Search**: grep (content search with regex), glob (file pattern matching)
- **Terminal**: bash (shell command execution with timeout and background support)
- **Web**: webfetch (URL content retrieval), websearch (web search integration)
- **Browser Automation**: navigate, click, fill, snapshot, screenshot, extract
- **LSP Integration**: Language Server Protocol tools for code intelligence

#### LLM Adapters
- **OpenAI Adapter** - GPT-4, GPT-4 Turbo, GPT-3.5 support
- **OpenAI-Compatible Adapter** - For local models and alternative providers
- **Anthropic Adapter** - Claude 3.5, Claude 3 Opus/Sonnet/Haiku support
- **Gemini Adapter** - Google Gemini Pro/Ultra support
- **Mock Adapter** - For testing without API calls

#### Dynamic Prompt System
- Context-aware prompt building with workspace information
- Git status and recent commits integration
- File tree context injection
- Category-specific prompt templates (8 categories)
- Agent-specific system prompts

#### Hook Lifecycle Framework
- **onToolStart** - Pre-execution hooks with skip/modify capabilities
- **onToolEnd** - Post-execution hooks with output modification
- **onMessageCreate** - Message interception and injection
- **onContextOverflow** - Context window management
- **onEditError** - Edit error recovery assistance
- Built-in hooks: context monitor, output truncator, edit error recovery

#### Claude Code Compatibility Layer
- Full support for Claude Code hook configuration format
- Configuration loader for .claude/settings.json
- Environment variable expansion ($VAR, ${VAR}, ${VAR:-default})
- PreToolUse/PostToolUse hook adaptation

#### Session Management
- Session continuity and crash recovery
- Automatic session state persistence
- Resume capability after unexpected termination
- Session idle detection

#### Task Management
- Task failure retry mechanism with exponential backoff
- Task status tracking (pending, in_progress, completed, failed)
- Task dependency management
- Background task execution

#### Streaming Support
- Real-time streaming responses from LLM providers
- Frontend streaming renderer with markdown support
- Progressive content display

#### Security
- API key encryption using OS keychain
- Workspace sandboxing for tool execution
- Permission policies for tool access control

#### Documentation
- User guide (docs/user-guide.md)
- API reference (docs/api-reference.md)
- Architecture documentation (docs/architecture.md)
- Database schema documentation (docs/database-schema.md)
- Development guide (docs/development.md)
- Troubleshooting guide (docs/troubleshooting.md)

#### Database
- Embedded PostgreSQL for data persistence
- Prisma ORM for type-safe database access
- Models: Space, Session, Message, Task, Run, ApiKey

#### UI Components
- Chat interface with message cards and syntax highlighting
- File explorer with tree view
- Browser panel for web automation
- Task panel for workflow visualization
- Settings panels for provider/agent configuration
- Resizable panel layout

### Technical Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Zustand
- **Backend**: Electron 28, Node.js
- **Database**: Embedded PostgreSQL, Prisma
- **Build**: Vite, electron-vite
- **Testing**: Vitest, Playwright

---

[1.0.0]: https://github.com/anthropics/godcode/releases/tag/v1.0.0
