/**
 * Configuration Storage - SQLite database management (~/.bun-deploy/config.db)
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppConfig, GlobalConfig, ServerConfig } from "../types/index.js";
import { closeDatabase, getDatabase, initializeSchema, resetDatabase } from "./database.js";

const CONFIG_DIR = join(homedir(), ".bun-deploy");

// Initialise schema on module load
initializeSchema();

// Global Config
export async function getGlobalConfig(): Promise<GlobalConfig> {
  const db = getDatabase();
  const rows = db.query("SELECT provider_name, settings FROM provider_settings").all() as Array<{
    provider_name: string;
    settings: string;
  }>;

  const config: GlobalConfig = {};
  for (const row of rows) {
    try {
      const settings = JSON.parse(row.settings) as Record<string, string>;
      // Flatten provider settings into global config with provider prefix
      for (const [key, value] of Object.entries(settings)) {
        config[`${row.provider_name}.${key}`] = value;
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  return config;
}

export async function setGlobalConfig(config: GlobalConfig): Promise<void> {
  const db = getDatabase();

  // Group config by provider prefix
  const byProvider: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue;
    const dotIndex = key.indexOf(".");
    if (dotIndex === -1) continue;
    const provider = key.slice(0, dotIndex);
    const settingKey = key.slice(dotIndex + 1);
    if (!byProvider[provider]) {
      byProvider[provider] = {};
    }
    byProvider[provider][settingKey] = value;
  }

  // Insert/update each provider's settings
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO provider_settings (provider_name, settings) VALUES (?, ?)",
  );
  for (const [provider, settings] of Object.entries(byProvider)) {
    stmt.run(provider, JSON.stringify(settings));
  }
}

export async function getConfigValue(key: string): Promise<string | undefined> {
  const db = getDatabase();
  const dotIndex = key.indexOf(".");
  if (dotIndex === -1) return undefined;

  const provider = key.slice(0, dotIndex);
  const settingKey = key.slice(dotIndex + 1);

  const row = db
    .query("SELECT settings FROM provider_settings WHERE provider_name = ?")
    .get(provider) as { settings: string } | undefined;

  if (!row) return undefined;

  try {
    const settings = JSON.parse(row.settings) as Record<string, string>;
    return settings[settingKey];
  } catch {
    return undefined;
  }
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const db = getDatabase();
  const dotIndex = key.indexOf(".");
  if (dotIndex === -1) return;

  const provider = key.slice(0, dotIndex);
  const settingKey = key.slice(dotIndex + 1);

  // Get existing settings
  const row = db
    .query("SELECT settings FROM provider_settings WHERE provider_name = ?")
    .get(provider) as { settings: string } | undefined;

  let settings: Record<string, string> = {};
  if (row) {
    try {
      settings = JSON.parse(row.settings) as Record<string, string>;
    } catch {
      // Start fresh if invalid JSON
    }
  }

  settings[settingKey] = value;

  db.prepare(
    "INSERT OR REPLACE INTO provider_settings (provider_name, settings) VALUES (?, ?)",
  ).run(provider, JSON.stringify(settings));
}

// Server Config
export async function saveServer(config: ServerConfig): Promise<void> {
  const db = getDatabase();
  db.prepare(
    `
    INSERT OR REPLACE INTO servers
    (name, host, port, username, ssh_key_path, ssh_key_passphrase, state, provisioned_at, installed_apps, installed_services)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    config.name,
    config.host,
    config.port,
    config.username,
    config.sshKeyPath ?? null,
    config.sshKeyPassphrase ?? null,
    config.state,
    config.provisionedAt ?? null,
    JSON.stringify(config.installedApps),
    JSON.stringify(config.installedServices),
  );
}

export async function getServer(name: string): Promise<ServerConfig | null> {
  const db = getDatabase();
  const row = db.query("SELECT * FROM servers WHERE name = ?").get(name) as
    | {
        name: string;
        host: string;
        port: number;
        username: string;
        ssh_key_path: string | null;
        ssh_key_passphrase: string | null;
        state: string;
        provisioned_at: string | null;
        installed_apps: string;
        installed_services: string;
      }
    | undefined;

  if (!row) return null;

  return {
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    sshKeyPath: row.ssh_key_path ?? undefined,
    sshKeyPassphrase: row.ssh_key_passphrase ?? undefined,
    state: row.state as ServerConfig["state"],
    provisionedAt: row.provisioned_at ?? undefined,
    installedApps: parseJsonArray(row.installed_apps),
    installedServices: parseJsonArray(row.installed_services),
  };
}

export async function listServers(): Promise<ServerConfig[]> {
  const db = getDatabase();
  const rows = db.query("SELECT * FROM servers").all() as Array<{
    name: string;
    host: string;
    port: number;
    username: string;
    ssh_key_path: string | null;
    ssh_key_passphrase: string | null;
    state: string;
    provisioned_at: string | null;
    installed_apps: string;
    installed_services: string;
  }>;

  return rows.map((row) => ({
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    sshKeyPath: row.ssh_key_path ?? undefined,
    sshKeyPassphrase: row.ssh_key_passphrase ?? undefined,
    state: row.state as ServerConfig["state"],
    provisionedAt: row.provisioned_at ?? undefined,
    installedApps: parseJsonArray(row.installed_apps),
    installedServices: parseJsonArray(row.installed_services),
  }));
}

export async function removeServer(name: string): Promise<boolean> {
  const db = getDatabase();
  const result = db.prepare("DELETE FROM servers WHERE name = ?").run(name);
  return result.changes > 0;
}

export async function serverExists(name: string): Promise<boolean> {
  const db = getDatabase();
  const row = db.query("SELECT 1 FROM servers WHERE name = ?").get(name) as
    | { 1: number }
    | undefined;
  return row !== undefined;
}

// App Config
export async function saveApp(config: AppConfig): Promise<void> {
  const db = getDatabase();
  db.prepare(
    `
    INSERT OR REPLACE INTO apps
    (name, server_name, app_type, git_repo, git_branch, domain, env_vars, deploy_script, port, last_deployed_at, last_commit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    config.name,
    config.serverName,
    config.appType,
    config.gitRepo,
    config.gitBranch,
    config.domain ?? null,
    JSON.stringify(config.envVars),
    config.deployScript ?? null,
    config.port,
    config.lastDeployedAt ?? null,
    config.lastCommit ?? null,
  );
}

export async function getApp(name: string): Promise<AppConfig | null> {
  const db = getDatabase();
  const row = db.query("SELECT * FROM apps WHERE name = ?").get(name) as
    | {
        name: string;
        server_name: string;
        app_type: string;
        git_repo: string;
        git_branch: string;
        domain: string | null;
        env_vars: string;
        deploy_script: string | null;
        port: number;
        last_deployed_at: string | null;
        last_commit: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    name: row.name,
    serverName: row.server_name,
    appType: row.app_type,
    gitRepo: row.git_repo,
    gitBranch: row.git_branch,
    domain: row.domain ?? undefined,
    envVars: parseJsonObject(row.env_vars),
    deployScript: row.deploy_script ?? undefined,
    port: row.port,
    lastDeployedAt: row.last_deployed_at ?? undefined,
    lastCommit: row.last_commit ?? undefined,
  };
}

export async function listApps(): Promise<AppConfig[]> {
  const db = getDatabase();
  const rows = db.query("SELECT * FROM apps").all() as Array<{
    name: string;
    server_name: string;
    app_type: string;
    git_repo: string;
    git_branch: string;
    domain: string | null;
    env_vars: string;
    deploy_script: string | null;
    port: number;
    last_deployed_at: string | null;
    last_commit: string | null;
  }>;

  return rows.map((row) => ({
    name: row.name,
    serverName: row.server_name,
    appType: row.app_type,
    gitRepo: row.git_repo,
    gitBranch: row.git_branch,
    domain: row.domain ?? undefined,
    envVars: parseJsonObject(row.env_vars),
    deployScript: row.deploy_script ?? undefined,
    port: row.port,
    lastDeployedAt: row.last_deployed_at ?? undefined,
    lastCommit: row.last_commit ?? undefined,
  }));
}

export async function listAppsByServer(serverName: string): Promise<AppConfig[]> {
  const db = getDatabase();
  const rows = db.query("SELECT * FROM apps WHERE server_name = ?").all(serverName) as Array<{
    name: string;
    server_name: string;
    app_type: string;
    git_repo: string;
    git_branch: string;
    domain: string | null;
    env_vars: string;
    deploy_script: string | null;
    port: number;
    last_deployed_at: string | null;
    last_commit: string | null;
  }>;

  return rows.map((row) => ({
    name: row.name,
    serverName: row.server_name,
    appType: row.app_type,
    gitRepo: row.git_repo,
    gitBranch: row.git_branch,
    domain: row.domain ?? undefined,
    envVars: parseJsonObject(row.env_vars),
    deployScript: row.deploy_script ?? undefined,
    port: row.port,
    lastDeployedAt: row.last_deployed_at ?? undefined,
    lastCommit: row.last_commit ?? undefined,
  }));
}

export async function removeApp(name: string): Promise<boolean> {
  const db = getDatabase();
  const result = db.prepare("DELETE FROM apps WHERE name = ?").run(name);
  return result.changes > 0;
}

export async function appExists(name: string): Promise<boolean> {
  const db = getDatabase();
  const row = db.query("SELECT 1 FROM apps WHERE name = ?").get(name) as { 1: number } | undefined;
  return row !== undefined;
}

// Paths (deprecated but kept for API compatibility)
export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getServerConfigPath(name: string): string {
  return join(CONFIG_DIR, "servers", `${name}.json`);
}

export function getAppConfigPath(name: string): string {
  return join(CONFIG_DIR, "apps", `${name}.json`);
}

// Helper functions
function parseJsonArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fall through to return empty array
  }
  return [];
}

function parseJsonObject(json: string): Record<string, string> {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch {
    // Fall through to return empty object
  }
  return {};
}

// Re-export for testing
export { closeDatabase, resetDatabase };
