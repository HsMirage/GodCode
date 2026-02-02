# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-01

### Added

- **Multi-LLM Support**: Integrated industry-leading models including Anthropic (Claude), OpenAI (GPT-4), and Google Gemini.
- **Task Delegation**: Implemented a Workforce Engine that decomposes complex requests into a Directed Acyclic Graph (DAG) of sub-tasks for specialized agents.
- **Embedded Browser**: Built-in AI-controlled browser environment for research and automated E2E testing using Playwright.
- **Workspace Management**: Isolated "Spaces" for project management with real-time file system synchronization.
- **Session Recovery**: Robust state management powered by an embedded PostgreSQL database and Prisma ORM to ensure session persistence.
- **Workflow Visualization**: Real-time interactive graph view for tracking agent activities and task dependencies.
- **Cross-Platform Delivery**: Support for native Windows desktop application and Linux-compatible Web Server mode.
