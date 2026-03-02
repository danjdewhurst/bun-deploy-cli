# SQLite Storage Design

## Overview
Replace JSON file storage with Bun's native SQLite bindings (`bun:sqlite`) for storing server and app configurations.

## Goals
- Use `bun:sqlite` for all configuration storage
- Maintain identical `config-store.ts` API for backward compatibility
- Enable proper querying and transactions
- Support future schema migrations via versioning

## Non-Goals
- Backward compatibility with JSON files (no migration needed)
- Dual storage modes

## Database Schema

### Schema Version Table
```sql
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY
);
```

### Servers Table
```sql
CREATE TABLE servers (
  name TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  ssh_key_path TEXT,
  ssh_key_passphrase TEXT,
  state TEXT NOT NULL CHECK(state IN ('unprovisioned', 'provisioning', 'ready', 'error')),
  provisioned_at TEXT,
  installed_apps TEXT -- JSON array of installed app names
);
```

### Apps Table
```sql
CREATE TABLE apps (
  name TEXT PRIMARY KEY,
  server_name TEXT NOT NULL REFERENCES servers(name) ON DELETE CASCADE,
  app_type TEXT NOT NULL,
  git_repo TEXT NOT NULL,
  git_branch TEXT NOT NULL,
  domain TEXT,
  env_vars TEXT, -- JSON object
  deploy_script TEXT,
  port INTEGER NOT NULL,
  last_deployed_at TEXT,
  last_commit TEXT
);
```

### Provider Settings Table
```sql
CREATE TABLE provider_settings (
  provider_name TEXT PRIMARY KEY,
  settings TEXT -- JSON object
);
```

### Indices
```sql
CREATE INDEX idx_apps_server ON apps(server_name);
CREATE INDEX idx_apps_type ON apps(app_type);
```

## API Compatibility

The `config-store.ts` module maintains the same exports:

```typescript
// Global config
export async function getGlobalConfig(): Promise<GlobalConfig>;
export async function setGlobalConfig(config: GlobalConfig): Promise<void>;
export async function getConfigValue(key: string): Promise<string | undefined>;
export async function setConfigValue(key: string, value: string): Promise<void>;

// Server config
export async function saveServer(config: ServerConfig): Promise<void>;
export async function getServer(name: string): Promise<ServerConfig | null>;
export async function listServers(): Promise<ServerConfig[]>;
export async function removeServer(name: string): Promise<boolean>;
export async function serverExists(name: string): Promise<boolean>;

// App config
export async function saveApp(config: AppConfig): Promise<void>;
export async function getApp(name: string): Promise<AppConfig | null>;
export async function listApps(): Promise<AppConfig[]>;
export async function listAppsByServer(serverName: string): Promise<AppConfig[]>;
export async function removeApp(name: string): Promise<boolean>;
export async function appExists(name: string): Promise<boolean>;

// Paths (deprecated but kept for compatibility)
export function getConfigDir(): string;
export function getServerConfigPath(name: string): string;
export function getAppConfigPath(name: string): string;
```

## Implementation Details

### Connection Management
- Single `Database` instance created on first use
- Stored in module-level variable
- Database file: `~/.bun-deploy/config.db`

### JSON Serialization
- `installed_apps` and `env_vars` stored as JSON strings
- Parsed/stringified on read/write

### Error Handling
- SQLite errors wrapped in descriptive messages
- Transactions for multi-table operations
- Cascading deletes handled by foreign key constraints

### Schema Migrations
- Version stored in `schema_version` table
- Migration functions applied sequentially on startup
- Current schema version: 1
