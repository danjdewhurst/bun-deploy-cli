/**
 * Server Commands - `bun-deploy server add|list|remove|setup`
 */

import {
  getServer,
  listServers,
  removeServer,
  saveServer,
  serverExists,
} from "../core/config-store.js";
import { SSHClient } from "../core/ssh-client.js";
import { provisionUbuntu2404 } from "../provisioners/ubuntu-2404.js";
import type { ServerConfig, ServerState } from "../types/index.js";

interface AddServerOptions {
  host: string;
  port?: string;
  user?: string;
  key?: string;
  passphrase?: string;
}

export async function addServer(name: string, options: AddServerOptions): Promise<void> {
  if (await serverExists(name)) {
    console.error(`Error: Server '${name}' already exists.`);
    process.exit(1);
  }

  const serverConfig: ServerConfig = {
    name,
    host: options.host,
    port: options.port ? parseInt(options.port, 10) : 22,
    username: options.user || "root",
    sshKeyPath: options.key,
    sshKeyPassphrase: options.passphrase,
    state: "unprovisioned",
    installedApps: [],
  };

  // Validate connection
  console.log(`Validating connection to ${serverConfig.host}...`);
  const client = new SSHClient(serverConfig);

  try {
    await client.connect();
    console.log("Connection successful!");
    client.disconnect();
  } catch (error) {
    console.error(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  await saveServer(serverConfig);
  console.log(`Server '${name}' added successfully.`);
  console.log(`Run 'bun-deploy server setup ${name}' to provision the server.`);
}

export async function listServersCommand(): Promise<void> {
  const servers = await listServers();

  if (servers.length === 0) {
    console.log("No servers configured. Add one with: bun-deploy server add <name> --host <ip>");
    return;
  }

  console.log("\nConfigured Servers:");
  console.log("=".repeat(80));
  console.log(
    `${"Name".padEnd(15)} ${"Host".padEnd(20)} ${"User".padEnd(12)} ${"State".padEnd(12)} ${"Apps".padEnd(6)}`,
  );
  console.log("-".repeat(80));

  for (const server of servers) {
    const stateColour = getStateColour(server.state);
    const appCount = server.installedApps?.length || 0;
    console.log(
      `${server.name.padEnd(15)} ${server.host.padEnd(20)} ${server.username.padEnd(12)} ${stateColour}${server.state.padEnd(12)}\x1b[0m ${String(appCount).padEnd(6)}`,
    );
  }

  console.log("=".repeat(80));
  console.log();
}

function getStateColour(state: ServerState): string {
  switch (state) {
    case "ready":
      return "\x1b[32m"; // Green
    case "provisioning":
      return "\x1b[33m"; // Yellow
    case "error":
      return "\x1b[31m"; // Red
    default:
      return "\x1b[90m"; // Grey
  }
}

export async function removeServerCommand(name: string, force = false): Promise<void> {
  const server = await getServer(name);

  if (!server) {
    console.error(`Error: Server '${name}' not found.`);
    process.exit(1);
  }

  if (!force) {
    console.log(
      `Are you sure you want to remove server '${name}'? This will not delete the actual server, only the local configuration.`,
    );
    console.log("Use --force to skip this confirmation.");
    process.exit(1);
  }

  const removed = await removeServer(name);

  if (removed) {
    console.log(`Server '${name}' removed from configuration.`);
  } else {
    console.error(`Failed to remove server '${name}'.`);
    process.exit(1);
  }
}

export async function setupServer(name: string): Promise<void> {
  const server = await getServer(name);

  if (!server) {
    console.error(`Error: Server '${name}' not found.`);
    process.exit(1);
  }

  if (server.state === "ready") {
    console.log(`Server '${name}' is already provisioned.`);
    const confirm = process.argv.includes("--force");
    if (!confirm) {
      console.log("Use --force to re-run provisioning.");
      return;
    }
  }

  console.log(`\nSetting up server '${name}' (${server.host})...`);
  console.log("This will install and configure the following:");
  console.log("  - System updates and essential packages");
  console.log("  - Security hardening (ufw, fail2ban)");
  console.log("  - Bun.js runtime");
  console.log("  - Nginx web server");
  console.log("  - Deploy user and directory structure");
  console.log();

  try {
    await provisionUbuntu2404(server);
    console.log("\nServer setup complete!");
  } catch (error) {
    console.error(
      `\nServer setup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

export async function testConnection(name: string): Promise<void> {
  const server = await getServer(name);

  if (!server) {
    console.error(`Error: Server '${name}' not found.`);
    process.exit(1);
  }

  console.log(`Testing connection to ${server.host}...`);

  const client = new SSHClient(server);

  try {
    await client.connect();
    console.log("Connection successful!");

    // Run a simple command to verify
    const result = await client.exec("whoami");
    console.log(`Logged in as: ${result.stdout.trim()}`);

    const uptime = await client.exec("uptime -p");
    console.log(`Server uptime: ${uptime.stdout.trim()}`);

    client.disconnect();
  } catch (error) {
    console.error(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
