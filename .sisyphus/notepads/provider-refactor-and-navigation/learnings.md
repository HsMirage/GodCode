# Learnings - Provider Refactor and Navigation

## Conventions Discovered

## Patterns Found

## Technical Insights

## API Key Management Refactoring
- Refactored `ApiKeyForm` to support dynamic list of keys instead of hardcoded providers
- Updated `ApiKey` Prisma model to include `label` and `baseURL` fields
- Removed `provider` uniqueness constraint to allow multiple keys per provider type (or custom ones)
- Implemented `id` based CRUD operations in `KeychainService` while maintaining backward compatibility for `getApiKey`
- Updated IPC handlers to support new data structure
- Used `custom` as default provider type for new entries
- Added unit test updates to reflect schema changes (note: some mock adjustments were needed)
