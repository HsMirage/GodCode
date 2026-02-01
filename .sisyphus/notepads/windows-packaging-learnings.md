# Learnings

## Windows Packaging on Linux (WSL)

- **Wine Requirement**: Building for Windows (`nsis` or even `dir` target) using `electron-builder` on Linux requires `wine` to be installed.
- **Error**: `wine is required, please see https://electron.build/multi-platform-build#linux` or `app-builder process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`.
- **Mitigation**: Users must install `wine` on their Linux build machine, or build on Windows/CI.

# Issues

- **Missing Wine**: The current environment lacks `wine` and `sudo` access, preventing full verification of the Windows installer generation.
