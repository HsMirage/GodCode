# Issues & Gotchas

## 2026-02-06 Session Start

### Known from Audit

- DelegateEngine hardcodes default prompt (ignoring DB systemPrompt)
- file-write tool doesn't register artifacts → ghost writes
- BrowserShell hardcodes single view (`main-browser`)
- BrowserView z-index may cover React overlays
