# Decisions - Provider Refactor and Navigation

## Architectural Decisions

- **Provider Field**: 保留 `provider` 字段，值统一设为 `"openai-compat"`
- **API Key Structure**: 每个密钥包含: label, baseURL (必填), apiKey
- **Model-Key Binding**: 模型通过下拉选择已保存的密钥标签
- **Back Button**: 使用 `navigate(-1)` + 历史为空回退到 `/`

## Design Choices
