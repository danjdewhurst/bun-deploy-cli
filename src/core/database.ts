/**
 * Database module - SQLite storage using Bun's native bindings
 */
import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";

function getDbPath(): string {
  if (process.env.BUN_DEPLOY_DB_PATH) {
    return process.env.BUN_DEPLOY_DB_PATH;
  }
  return join(homedir(), ".bun-deploy", "config.db");
}

let db: Database | null = null;
let dbPath: string | undefined;

/**
 * Get or create the singleton database instance
 */
export function getDatabase(): Database {
  const currentPath = getDbPath();
  // Recreate database if path changed (for testing)
  if (db && dbPath !== currentPath) {
    db.close();
    db = null;
  }
  if (!db) {
    dbPath = currentPath;
    db = new Database(currentPath, { create: true });
    db.run("PRAGMA foreign_keys = ON");
  }
  return db;
}

/**
 * Close the database connection (mainly for testing)
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Reset database connection with a new path (for testing)
 */
export function resetDatabase(path?: string): void {
  closeDatabase();
  if (path) {
    process.env.BUN_DEPLOY_DB_PATH = path;
  } else {
    delete process.env.BUN_DEPLOY_DB_PATH;
  }
}

/**
 * Get the database path (for external use)
 */
export function getDatabasePath(): string {
  return getDbPath();
}

/**
 * Current schema version - increment when making schema changes
 */
const CURRENT_SCHEMA_VERSION = 2;

/**
 * Initialize database schema
 * Called automatically on first database use
 */
export function initializeSchema(): void {
  const database = getDatabase();

  // Create schema version table
  database.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )
  `);

  // Check current schema version
  const versionRow = database.query("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;

  const currentVersion = versionRow?.version ?? 0;

  if (currentVersion < CURRENT_SCHEMA_VERSION) {
    // Run migrations
    runMigrations(database, currentVersion);

    // Update schema version
    database
      .prepare("INSERT OR REPLACE INTO schema_version (version) VALUES (?)")
      .run(CURRENT_SCHEMA_VERSION);
  }
}

/**
 * Run database migrations
 */
function runMigrations(database: Database, fromVersion: number): void {
  if (fromVersion < 1) {
    // Initial schema creation

    // Servers table
    database.run(`
      CREATE TABLE IF NOT EXISTS servers (
        name TEXT PRIMARY KEY,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 22,
        username TEXT NOT NULL,
        ssh_key_path TEXT,
        ssh_key_passphrase TEXT,
        state TEXT NOT NULL CHECK(state IN ('unprovisioned', 'provisioning', 'ready', 'error')),
        provisioned_at TEXT,
        installed_apps TEXT
      )
    `);

    // Apps table with foreign key to servers
    database.run(`
      CREATE TABLE IF NOT EXISTS apps (
        name TEXT PRIMARY KEY,
        server_name TEXT NOT NULL,
        app_type TEXT NOT NULL,
        git_repo TEXT NOT NULL,
        git_branch TEXT NOT NULL,
        domain TEXT,
        env_vars TEXT,
        deploy_script TEXT,
        port INTEGER NOT NULL,
        last_deployed_at TEXT,
        last_commit TEXT,
        FOREIGN KEY (server_name) REFERENCES servers(name) ON DELETE CASCADE
      )
    `);

    // Provider settings table
    database.run(`
      CREATE TABLE IF NOT EXISTS provider_settings (
        provider_name TEXT PRIMARY KEY,
        settings TEXT
      )
    `);

    // Indices for performance
    database.run("CREATE INDEX IF NOT EXISTS idx_apps_server ON apps(server_name)");
    database.run("CREATE INDEX IF NOT EXISTS idx_apps_type ON apps(app_type)");
  }

  if (fromVersion < 2) {
    // Add installed_services column to servers table
    // Use IF NOT EXISTS equivalent for SQLite (check pragma then add)
    const tableInfo = database
      .query("SELECT name FROM pragma_table_info('servers') WHERE name = 'installed_services'")
      .get() as { name: string } | undefined;

    if (!tableInfo) {
      database.run(`
        ALTER TABLE servers ADD COLUMN installed_services TEXT DEFAULT '[]'
      `);
    }
  }
}
