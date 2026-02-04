# Provider References Report

Generated: 2026-02-03

## Summary

Found provider-specific references in the following files that need to be updated:

## Files to Update (Wave 2 Tasks)

### Task 3: ModelConfigForm.tsx

- Line 12: `type ModelProvider = 'anthropic' | 'openai' | 'google' | 'ollama' | 'custom'`
- Line 83: `initialProvider = 'anthropic'`
- Line 131: `<option value='anthropic'>Anthropic</option>`
- Line 175: `placeholder='https://api.anthropic.com'`

### Task 4: LLM Factory and Adapters

- `src/main/services/llm/factory.ts:2` - imports AnthropicAdapter
- `src/main/services/llm/factory.ts:4` - imports GeminiAdapter
- `src/main/services/llm/factory.ts:16-21` - case statements for anthropic/gemini
- `src/main/services/llm/anthropic.adapter.ts` - ENTIRE FILE TO DELETE
- `src/main/services/llm/gemini.adapter.ts` - ENTIRE FILE TO DELETE

### Task 5: Routing Rules

- `src/renderer/src/pages/SettingsPage.tsx:32` - `model: 'gemini'`

### Additional Files to Update (Beyond Original Plan)

- `src/main/ipc/handlers/router.ts:20` - `model: 'gemini'`
- `src/main/ipc/validators.ts:24-42` - provider enum includes anthropic, gemini
- `src/main/services/delegate/categories.ts:25` - `model: 'gemini-pro'`
- `src/main/services/delegate/delegate-engine.ts:194-197` - provider detection from model name
- `src/main/services/llm/model-resolver.ts:150-170` - hardcoded provider fallbacks
- `src/main/services/router/smart-router.ts:37` - `model: 'gemini'`
- `src/main/services/workforce/workforce-engine.ts:86` - `selectedModel = 'gemini-1.5-pro'`
- `src/renderer/src/components/settings/ModelConfig.tsx:16-17` - hardcoded provider configs
- `src/renderer/src/store/agent.store.ts:66` - `model: 'gemini-pro'`

## Files Already Updated (Task 1)

- `src/renderer/src/components/settings/ApiKeyForm.tsx` - ✅ DONE

## Recommendations

1. Task 4 should also update:
   - `delegate-engine.ts` provider detection logic
   - `model-resolver.ts` fallback chains
   - `workforce-engine.ts` provider selection
   - `validators.ts` provider enum
2. Task 5 should also update:
   - `smart-router.ts` default rules
   - `router.ts` IPC handlers
3. Consider adding Task to clean up `ModelConfig.tsx` and `agent.store.ts`
