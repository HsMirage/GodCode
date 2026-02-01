Fixed database tests by mocking PostgresManager behavior.
- Mocked child_process.spawn to simulate successful postgres initialization and startup.
- Mocked fs.existsSync to return true for binary paths and false for PG_VERSION to trigger initialization.
- Updated electron.app.getPath to return os.tmpdir() for 'temp' path.
- Removed obsolete embedded-postgres mock as it is no longer used.
