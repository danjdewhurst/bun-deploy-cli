# SQLite Storage Implementation Plan

## Task 1: Create database schema and connection module

**File:** `src/core/database.ts` (new file)

**Steps:**
1. Create `src/core/database.ts` with Database import from "bun:sqlite"
2. Define database path: `~/.bun-deploy/config.db`
3. Create `getDatabase()` function that returns singleton Database instance
4. Add `initializeSchema()` function that:
   - Creates schema_version table
   - Creates servers table with all columns
   - Creates apps table with foreign key to servers
   - Creates provider_settings table
   - Creates indices on apps.server_name and apps.app_type
   - Inserts initial schema version (1)
5. Enable foreign keys with `PRAGMA foreign_keys = ON`

**Verification:**
- Run `bun check` to verify TypeScript compiles

## Task 2: Update config-store.ts to use SQLite

**File:** `src/core/config-store.ts`

**Steps:**
1. Remove imports: `mkdir, readdir, readFile, rename, stat, unlink, writeFile` from node:fs/promises
2. Keep imports: `homedir` from node:os, `join` from node:path
3. Add import: `getDatabase, initializeSchema` from `./database.js`
4. Update `getGlobalConfig()` to query provider_settings table, aggregate into GlobalConfig object
5. Update `setGlobalConfig()` to insert/update provider_settings rows
6. Update `getConfigValue()` to query specific provider setting
7. Update `setConfigValue()` to insert/update specific provider setting
8. Update `saveServer()` to use INSERT OR REPLACE INTO servers
9. Update `getServer()` to query servers table, parse installed_apps JSON
10. Update `listServers()` to query all servers, parse JSON fields
11. Update `removeServer()` to DELETE FROM servers (cascade handles apps)
12. Update `serverExists()` to use SELECT 1 FROM servers WHERE name = ?
13. Update `saveApp()` to use INSERT OR REPLACE INTO apps
14. Update `getApp()` to query apps table, parse env_vars JSON
15. Update `listApps()` to query all apps, parse JSON fields
16. Update `listAppsByServer()` to query with WHERE server_name = ?
17. Update `removeApp()` to DELETE FROM apps WHERE name = ?
18. Update `appExists()` to use SELECT 1 FROM apps WHERE name = ?
19. Keep path helper functions for API compatibility but mark as deprecated
20. Add `initializeSchema()` call on module load

**Verification:**
- Run `bun check` to verify TypeScript compiles
- Run `bun test` to verify existing tests still pass (may need updates)

## Task 3: Update tests for SQLite storage

**File:** `src/core/config-store.test.ts` (new file)

**Steps:**
1. Create test file with `bun:test` imports
2. Use temporary database path for tests (in /tmp)
3. Test all config-store functions:
   - Global config get/set
   - Server CRUD operations
   - App CRUD operations
   - Foreign key cascade (deleting server deletes its apps)
   - JSON field parsing (installed_apps, env_vars)

**Verification:**
- Run `bun test src/core/config-store.test.ts`

## Task 4: Clean up and verify integration

**Files:** All files that use config-store

**Steps:**
1. Search for any direct file system usage of config paths
2. Update any code that reads/writes config files directly
3. Run full test suite: `bun test`
4. Run linter: `bun run check`

**Verification:**
- All tests pass
- No TypeScript errors
- No Biome linting errors
