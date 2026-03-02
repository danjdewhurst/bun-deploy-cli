/**
 * Provider Commands - `bun-deploy provider ...`
 *
 * Unified interface for managing cloud providers.
 * Works with any provider that implements the CloudProvider interface.
 */

import { saveServer } from "../core/config-store.js";
import {
  getAvailableProviders,
  getConfiguredProviders,
  getProvider,
  listProviderNames,
} from "../providers/index.js";
import type { CloudProvider, CloudServer } from "../types/index.js";

/**
 * Show status of all providers
 */
export async function providerStatus(): Promise<void> {
  const providers = await getAvailableProviders();

  console.log("\nCloud Provider Status:");
  console.log("=".repeat(60));

  if (providers.length === 0) {
    console.log("No cloud provider CLIs detected.");
    console.log("\nInstall a provider CLI to get started:");
    console.log("  Hetzner:   brew install hcloud");
    console.log("  AWS:       pip install awscli");
    console.log("  DigitalOcean: brew install doctl");
  } else {
    for (const provider of providers) {
      const status = await provider.getStatus();
      const configured = status.configured ? "✓ configured" : "✗ not configured";
      const colour = status.configured ? "\x1b[32m" : "\x1b[90m";

      console.log(`\n${provider.displayName} (${provider.name})`);
      console.log(`  Type:        ${provider.type}`);
      console.log(`  Status:      ${colour}${configured}\x1b[0m`);

      if (status.version) {
        console.log(`  Version:     ${status.version}`);
      }
      if (status.context) {
        console.log(`  Context:     ${status.context}`);
      }
      if (status.serverCount !== undefined) {
        console.log(`  Servers:     ${status.serverCount}`);
      }
      if (status.message && !status.configured) {
        console.log(`  Message:     ${status.message}`);
      }
    }
  }

  const allNames = listProviderNames();
  const availableNames = new Set(providers.map((p) => p.name));
  const unavailable = allNames.filter((n) => !availableNames.has(n));

  if (unavailable.length > 0) {
    console.log("\n\x1b[90mRegistered but not available:");
    for (const name of unavailable) {
      console.log(`  - ${name} (CLI not installed)\x1b[0m`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
}

/**
 * Configure a provider with credentials
 */
export async function configureProvider(
  name: string,
  credentials: Record<string, string>,
): Promise<void> {
  const provider = getProvider(name);

  if (!provider) {
    console.error(`Error: Unknown provider '${name}'.`);
    console.log(`\nAvailable providers: ${listProviderNames().join(", ")}`);
    process.exit(1);
  }

  const available = await provider.isAvailable();
  if (!available) {
    console.error(`Error: ${provider.displayName} CLI is not installed.`);
    console.log(`\nInstall instructions:`);
    if (name === "hetzner") {
      console.log("  brew install hcloud");
      console.log(
        "  curl -sSL https://raw.githubusercontent.com/hetznercloud/cli/main/install.sh | bash",
      );
    }
    process.exit(1);
  }

  try {
    await provider.configure(credentials);
    console.log(`✓ ${provider.displayName} configured successfully!`);
  } catch (error) {
    console.error(`Error: Failed to configure ${provider.displayName}.`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * List servers from a specific provider or all providers
 */
export async function listProviderServers(providerName?: string): Promise<void> {
  let providers: CloudProvider[];

  if (providerName) {
    const provider = getProvider(providerName);
    if (!provider) {
      console.error(`Error: Unknown provider '${providerName}'.`);
      process.exit(1);
    }
    providers = [provider];
  } else {
    providers = await getConfiguredProviders();
    if (providers.length === 0) {
      console.error("Error: No configured providers found.");
      console.log("\nConfigure a provider first:");
      console.log("  bun-deploy provider configure hetzner --token <token>");
      process.exit(1);
    }
  }

  const allServers: CloudServer[] = [];

  for (const provider of providers) {
    const configured = await provider.isConfigured();
    if (!configured) {
      console.log(`\n⚠ ${provider.displayName}: Not configured`);
      continue;
    }

    try {
      const servers = await provider.listServers();
      allServers.push(...servers);
    } catch (error) {
      console.error(`\n⚠ ${provider.displayName}: Failed to list servers`);
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  if (allServers.length === 0) {
    console.log("\nNo cloud servers found.");
    return;
  }

  console.log("\nCloud Servers:");
  console.log("=".repeat(110));
  console.log(
    `${"Provider".padEnd(12)} ${"ID".padEnd(12)} ${"Name".padEnd(20)} ${"Status".padEnd(12)} ${"Type".padEnd(12)} ${"Location".padEnd(10)} ${"IPv4".padEnd(16)}`,
  );
  console.log("-".repeat(110));

  for (const server of allServers) {
    const statusColour = getStatusColour(server.status);
    const ipv4 = server.ipv4 || "-";
    console.log(
      `${server.provider.padEnd(12)} ${server.id.padEnd(12)} ${server.name.padEnd(20)} ${statusColour}${server.status.padEnd(12)}\x1b[0m ${server.type.padEnd(12)} ${server.location.padEnd(10)} ${ipv4.padEnd(16)}`,
    );
  }

  console.log("=".repeat(110));
  console.log(`\nTotal: ${allServers.length} server(s)`);
}

/**
 * Create a new server via a provider
 */
interface CreateOptions {
  type?: string;
  location?: string;
  image?: string;
  sshKey?: string;
  label?: string[];
}

export async function createProviderServer(
  providerName: string,
  name: string,
  options: CreateOptions,
): Promise<void> {
  const provider = getProvider(providerName);

  if (!provider) {
    console.error(`Error: Unknown provider '${providerName}'.`);
    console.log(`\nAvailable providers: ${listProviderNames().join(", ")}`);
    process.exit(1);
  }

  const configured = await provider.isConfigured();
  if (!configured) {
    console.error(`Error: ${provider.displayName} is not configured.`);
    console.log(`\nConfigure it first:`);
    console.log(`  bun-deploy provider configure ${providerName} --token <token>`);
    process.exit(1);
  }

  // Parse labels
  const labels: Record<string, string> = {};
  if (options.label) {
    for (const label of options.label) {
      const [key, value] = label.split("=");
      if (key && value) {
        labels[key] = value;
      }
    }
  }

  console.log(`Creating server '${name}' via ${provider.displayName}...`);

  try {
    const server = await provider.createServer({
      name,
      type: options.type,
      location: options.location,
      image: options.image,
      sshKey: options.sshKey,
      labels,
    });

    console.log(`\n✓ Server created successfully!`);
    console.log(`\nServer Details:`);
    console.log(`  Name:     ${server.name}`);
    console.log(`  ID:       ${server.id}`);
    console.log(`  Type:     ${server.type}`);
    console.log(`  Location: ${server.location}`);
    console.log(`  Status:   ${server.status}`);
    if (server.ipv4) {
      console.log(`  IPv4:     ${server.ipv4}`);
    }

    console.log("\nNext steps:");
    console.log(`  1. Wait for server to be ready`);
    if (server.ipv4) {
      console.log(
        `  2. Add to bun-deploy: bun-deploy server add ${server.name} --host ${server.ipv4}`,
      );
      console.log(`  3. Set up server: bun-deploy server setup ${server.name}`);
    }
  } catch (error) {
    console.error(`\nError: Failed to create server.`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Delete a server via a provider
 */
export async function deleteProviderServer(
  providerName: string,
  identifier: string,
  force = false,
): Promise<void> {
  const provider = getProvider(providerName);

  if (!provider) {
    console.error(`Error: Unknown provider '${providerName}'.`);
    process.exit(1);
  }

  const configured = await provider.isConfigured();
  if (!configured) {
    console.error(`Error: ${provider.displayName} is not configured.`);
    process.exit(1);
  }

  // Get server details for confirmation
  const server = await provider.getServer(identifier);
  if (!server) {
    console.error(`Error: Server '${identifier}' not found in ${provider.displayName}.`);
    process.exit(1);
  }

  if (!force) {
    console.log(`Are you sure you want to delete this server?`);
    console.log(`  Provider: ${provider.displayName}`);
    console.log(`  Name:     ${server.name}`);
    console.log(`  ID:       ${server.id}`);
    console.log(`  Type:     ${server.type}`);
    console.log(`  IPv4:     ${server.ipv4 || "-"}`);
    console.log("\nThis will permanently delete the server and all its data!");
    console.log("Use --force to skip this confirmation.");
    process.exit(1);
  }

  console.log(`Deleting server '${server.name}'...`);

  try {
    await provider.deleteServer(identifier);
    console.log(`✓ Server '${server.name}' deleted successfully.`);
  } catch (error) {
    console.error(`Error: Failed to delete server.`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Sync servers from a provider to local config
 */
export async function syncProviderServers(providerName?: string, prefix?: string): Promise<void> {
  let providers: CloudProvider[];

  if (providerName) {
    const provider = getProvider(providerName);
    if (!provider) {
      console.error(`Error: Unknown provider '${providerName}'.`);
      process.exit(1);
    }
    providers = [provider];
  } else {
    providers = await getConfiguredProviders();
    if (providers.length === 0) {
      console.error("Error: No configured providers found.");
      process.exit(1);
    }
  }

  let totalSynced = 0;

  for (const provider of providers) {
    console.log(`\nSyncing from ${provider.displayName}...`);

    try {
      const synced = await provider.syncServers(
        async (config) => saveServer(config),
        (server) => {
          // Filter by prefix if provided, or by managed label
          if (prefix) {
            return server.name.startsWith(prefix);
          }
          return (
            server.labels["managed-by"] === "bun-deploy" || server.labels["bun-deploy"] === "true"
          );
        },
      );

      console.log(`  Synced ${synced} server(s)`);
      totalSynced += synced;
    } catch (error) {
      console.error(
        `  ⚠ Failed to sync: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`\n✓ Total synced: ${totalSynced} server(s)`);
  console.log("Run 'bun-deploy server list' to see all configured servers.");
}

function getStatusColour(status: string): string {
  switch (status) {
    case "running":
      return "\x1b[32m"; // Green
    case "creating":
    case "starting":
      return "\x1b[33m"; // Yellow
    case "stopped":
    case "stopping":
      return "\x1b[90m"; // Grey
    case "deleting":
    case "error":
      return "\x1b[31m"; // Red
    default:
      return "\x1b[0m"; // Reset
  }
}
