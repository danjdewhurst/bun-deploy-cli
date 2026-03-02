/**
 * Config Commands - `bun-deploy config get|set`
 */
import { getConfigValue, getGlobalConfig, setConfigValue } from "../core/config-store.js";

export async function getConfig(key: string): Promise<void> {
  const value = await getConfigValue(key);
  if (value !== undefined) {
    console.log(value);
  } else {
    console.error(`Configuration key '${key}' not found.`);
    process.exit(1);
  }
}

export async function setConfig(key: string, value: string): Promise<void> {
  await setConfigValue(key, value);
  console.log(`Set ${key}=${value}`);
}

export async function listConfig(): Promise<void> {
  const config = await getGlobalConfig();
  const entries = Object.entries(config);

  if (entries.length === 0) {
    console.log("No global configuration set.");
    return;
  }

  console.log("\nGlobal Configuration:");
  console.log("=".repeat(40));
  for (const [key, value] of entries) {
    console.log(`${key}=${value}`);
  }
  console.log("=".repeat(40));
}
