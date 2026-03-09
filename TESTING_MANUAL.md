# GodCode Manual Testing Checklist

**Version**: 1.0.0  
**Target Platform**: Windows 10/11  
**Test Date**: ******\_******  
**Tester**: ******\_******

---

## Pre-requisites

- [ ] Windows 10 or Windows 11 machine
- [ ] Administrator privileges
- [ ] Internet connection (for LLM API testing)

---

## Installation Testing

### Test 1: NSIS Installer Execution

**Location**: `dist/GodCode Setup 1.0.0.exe` (after Wine build or Windows build)

1. [ ] **Launch Installer**
   - Double-click `GodCode Setup 1.0.0.exe`
   - Verify: Installer window opens without errors

2. [ ] **Installation Directory Selection**
   - Verify: Option to change installation directory is available
   - Default: `C:\Users\<username>\AppData\Local\Programs\GodCode`
   - Test: Change to custom directory (e.g., `C:\GodCode`)
   - Verify: Custom path is accepted

3. [ ] **Installation Progress**
   - Verify: Installation progress bar displays
   - Verify: No error dialogs appear
   - Expected duration: 30-60 seconds

4. [ ] **Shortcut Creation**
   - Verify: Desktop shortcut "GodCode" is created
   - Verify: Start Menu entry exists in `Start Menu > GodCode`

5. [ ] **Completion**
   - Verify: "Finish" button appears
   - Verify: Option to "Launch GodCode" is present
   - Click: Finish with "Launch GodCode" checked

---

## Application Launch Testing

### Test 2: First Launch

1. [ ] **Application Starts**
   - Verify: Main window appears within 5 seconds
   - Window title: "GodCode"
   - Window icon: GodCode logo visible

2. [ ] **Database Initialization**
   - Verify: No database errors shown
   - Expected: Embedded PostgreSQL starts automatically
   - Check logs: `%APPDATA%\GodCode\logs\main.log`

3. [ ] **Main UI Loads**
   - Verify: Chat interface visible
   - Verify: Sidebar with Spaces visible
   - Verify: No console errors (open DevTools with Ctrl+Shift+I)

---

## Functional Testing

### Test 3: Space Management

1. [ ] **Create New Space**
   - Click: "+ New Space" button
   - Enter: "Test Project"
   - Select: Local folder (e.g., `C:\Temp\test-workspace`)
   - Verify: Space appears in sidebar

2. [ ] **Switch Spaces**
   - Create second space: "Second Project"
   - Click: Switch between spaces
   - Verify: Chat context clears when switching
   - Verify: No crashes

### Test 4: Chat Functionality

1. [ ] **Send Message**
   - Type: "Hello, GodCode"
   - Click: Send button
   - Verify: Message appears in chat
   - Verify: Waiting indicator shows

2. [ ] **API Key Configuration** (if not set)
   - Navigate: Settings > API Keys
   - Enter: OpenAI API key (sk-...)
   - Click: Save
   - Verify: Toast notification "API Key saved"

3. [ ] **LLM Response**
   - Send message: "What is 2+2?"
   - Verify: Assistant response appears
   - Verify: Response is formatted correctly

### Test 5: File Operations

1. [ ] **File Tree**
   - Verify: File tree shows workspace files
   - Create file: Right-click > New File
   - Verify: File appears in tree

2. [ ] **File Read/Write**
   - Send message: "Create a file called test.txt with content 'Hello World'"
   - Verify: File appears in workspace
   - Open file: Verify content is correct

### Test 6: Browser Automation

1. [ ] **Browser Open**
   - Send message: "Open browser to https://www.google.com"
   - Verify: Browser view opens in Content Canvas
   - Verify: Google homepage loads

2. [ ] **Browser Control**
   - Verify: Address bar shows current URL
   - Verify: Back/Forward buttons work
   - Close browser: X button
   - Verify: Browser closes cleanly

---

## Settings Testing

### Test 7: Model Configuration

1. [ ] **Open Settings**
   - Click: Settings icon (gear)
   - Verify: Settings page opens

2. [ ] **Select Model**
   - Navigate: Model Configuration
   - Change: Default model to "Claude 3.5 Sonnet"
   - Save: Configuration
   - Verify: Model selection persists after restart

### Test 8: Data Management

1. [ ] **Backup Creation**
   - Settings > Data Management
   - Click: "Create Backup"
   - Verify: Backup file created
   - Location: `%APPDATA%\GodCode\backups\`

2. [ ] **Export Data**
   - Click: "Export Chat History"
   - Verify: JSON file downloads
   - Open file: Verify chat data is present

---

## Session Recovery Testing

### Test 9: Crash Recovery

1. [ ] **Create Active Session**
   - Send message: "Create a plan with 5 tasks"
   - Wait for response
   - Force close: Alt+F4 (or Task Manager kill)

2. [ ] **Restart Application**
   - Launch GodCode again
   - Verify: Recovery prompt appears
   - Click: "Resume Session"
   - Verify: Previous chat context restored

---

## Performance Testing

### Test 10: Multi-Agent Concurrent Tasks

1. [ ] **Send Parallel Task**
   - Message: "Create 3 files: a.txt, b.txt, c.txt with different content"
   - Verify: Multiple agents spawn (check Workflow View)
   - Verify: All files created successfully
   - Verify: No crashes or freezes

2. [ ] **Memory Usage**
   - Open Task Manager
   - Verify: GodCode.exe memory < 500MB during idle
   - Verify: Memory < 1GB during active tasks

---

## Auto-Update Testing

### Test 11: Update Check

1. [ ] **Manual Update Check**
   - Help > Check for Updates
   - Verify: "No updates available" or update notification
   - If update available: Download and install
   - Verify: Application restarts successfully

---

## Uninstallation Testing

### Test 12: Uninstall

1. [ ] **Uninstall via Control Panel**
   - Open: Settings > Apps > Apps & Features
   - Find: GodCode
   - Click: Uninstall
   - Verify: Uninstaller runs

2. [ ] **Cleanup Verification**
   - Check: Desktop shortcut removed
   - Check: Start Menu entry removed
   - Check: Installation folder deleted
   - Note: User data in `%APPDATA%\GodCode` is preserved (by design)

3. [ ] **Complete Cleanup** (optional)
   - Manually delete: `%APPDATA%\GodCode`
   - Verify: All GodCode traces removed

---

## Error Handling Testing

### Test 13: Error Scenarios

1. [ ] **Invalid API Key**
   - Settings > API Keys
   - Enter: Invalid key "sk-invalid"
   - Send message: "Hello"
   - Verify: Error message displayed
   - Verify: No application crash

2. [ ] **Network Disconnection**
   - Disconnect network
   - Send message: "Test"
   - Verify: Network error shown gracefully
   - Reconnect network
   - Retry: Message sends successfully

3. [ ] **Invalid Workspace Path**
   - Create Space: Point to non-existent path
   - Verify: Error message shown
   - Verify: Application doesn't crash

---

## Sign-Off

### Test Results Summary

| Category           | Pass | Fail | Notes |
| ------------------ | ---- | ---- | ----- |
| Installation       | ☐    | ☐    |       |
| Launch             | ☐    | ☐    |       |
| Space Management   | ☐    | ☐    |       |
| Chat Functionality | ☐    | ☐    |       |
| File Operations    | ☐    | ☐    |       |
| Browser Automation | ☐    | ☐    |       |
| Settings           | ☐    | ☐    |       |
| Session Recovery   | ☐    | ☐    |       |
| Performance        | ☐    | ☐    |       |
| Auto-Update        | ☐    | ☐    |       |
| Uninstallation     | ☐    | ☐    |       |
| Error Handling     | ☐    | ☐    |       |

### Issues Found

| Issue # | Description | Severity | Status |
| ------- | ----------- | -------- | ------ |
| 1       |             |          |        |
| 2       |             |          |        |
| 3       |             |          |        |

### Tester Notes

```
Additional observations:




```

---

**Approval**: ☐ PASS ☐ FAIL  
**Signature**: ******\_******  
**Date**: ******\_******
