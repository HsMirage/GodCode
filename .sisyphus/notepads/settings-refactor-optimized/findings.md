## Settings Page Refactor

- **Simplified Tabs**: Reduced to 3 main tabs: `API服务商`, `智能体`, `数据管理`.
- **New Components**: Integrated `ProviderModelPanel` for the main provider configuration.
- **Cleanup**: Removed old `ApiKeyForm`, `ModelConfigForm`, and Routing Rules logic from the page itself (routing rules might need a new home if they are still needed, but per instructions, we focused on the requested structure).
- **Verification**: `pnpm typecheck` passed.
