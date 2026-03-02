/**
 * Configuration Storage - Local JSON config management (~/.bun-deploy/)
 */
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppConfig, GlobalConfig, ServerConfig } from "../types/index.js";

const CONFIG_DIR = join(homedir(), ".bun-deploy");
const SERVERS_DIR = join(CONFIG_DIR, "servers");
const APPS_DIR = join(CONFIG_DIR, "apps");
const GLOBAL_CONFIG_FILE = join(CONFIG_DIR, "config.json");

async function ensureDir(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile<T>(path: string, data: T): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}

function dirname(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "." : path.slice(0, lastSlash);
}

// Global Config
export async function getGlobalConfig(): Promise<GlobalConfig> {
  const config = await readJsonFile<GlobalConfig>(GLOBAL_CONFIG_FILE);
  return config ?? {};
}

export async function setGlobalConfig(config: GlobalConfig): Promise<void> {
  await writeJsonFile(GLOBAL_CONFIG_FILE, config);
}

export async function getConfigValue(key: string): Promise<string | undefined> {
  const config = await getGlobalConfig();
  return config[key];
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const config = await getGlobalConfig();
  config[key] = value;
  await setGlobalConfig(config);
}

// Server Config
export async function saveServer(config: ServerConfig): Promise<void> {
  await ensureDir(SERVERS_DIR);
  const path = join(SERVERS_DIR, `${config.name}.json`);
  await writeJsonFile(path, config);
}

export async function getServer(name: string): Promise<ServerConfig | null> {
  const path = join(SERVERS_DIR, `${name}.json`);
  return readJsonFile<ServerConfig>(path);
}

export async function listServers(): Promise<ServerConfig[]> {
  await ensureDir(SERVERS_DIR);
  const files = await readdir(SERVERS_DIR);
  const servers: ServerConfig[] = [];

  for (const file of files) {
    if (file.endsWith(".json")) {
      const path = join(SERVERS_DIR, file);
      const server = await readJsonFile<ServerConfig>(path);
      if (server) {
        servers.push(server);
      }
    }
  }

  return servers;
}

export async function removeServer(name: string): Promise<boolean> {
  const path = join(SERVERS_DIR, `${name}.json`);
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

export async function serverExists(name: string): Promise<boolean> {
  const path = join(SERVERS_DIR, `${name}.json`);
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

// App Config
export async function saveApp(config: AppConfig): Promise<void> {
  await ensureDir(APPS_DIR);
  const path = join(APPS_DIR, `${config.name}.json`);
  await writeJsonFile(path, config);
}

export async function getApp(name: string): Promise<AppConfig | null> {
  const path = join(APPS_DIR, `${name}.json`);
  return readJsonFile<AppConfig>(path);
}

export async function listApps(): Promise<AppConfig[]> {
  await ensureDir(APPS_DIR);
  const files = await readdir(APPS_DIR);
  const apps: AppConfig[] = [];

  for (const file of files) {
    if (file.endsWith(".json")) {
      const path = join(APPS_DIR, file);
      const app = await readJsonFile<AppConfig>(path);
      if (app) {
        apps.push(app);
      }
    }
  }

  return apps;
}

export async function listAppsByServer(serverName: string): Promise<AppConfig[]> {
  const apps = await listApps();
  return apps.filter((app) => app.serverName === serverName);
}

export async function removeApp(name: string): Promise<boolean> {
  const path = join(APPS_DIR, `${name}.json`);
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

export async function appExists(name: string): Promise<boolean> {
  const path = join(APPS_DIR, `${name}.json`);
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

// Paths (for external use)
export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getServerConfigPath(name: string): string {
  return join(SERVERS_DIR, `${name}.json`);
}

export function getAppConfigPath(name: string): string {
  return join(APPS_DIR, `${name}.json`);
}
