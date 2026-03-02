#!/usr/bin/env bun
/**
 * Bun Deploy CLI - Entry point
 */
import { Command } from "commander";
import {
  createApp,
  deployApp,
  listAppsCommand,
  manageEnv,
  removeAppCommand,
  streamLogs,
} from "./commands/app.js";
import {
  configureProvider,
  createProviderServer,
  deleteProviderServer,
  listProviderServers,
  providerStatus,
  syncProviderServers,
} from "./commands/provider.js";
import {
  addServer,
  listServersCommand,
  removeServerCommand,
  setupServer,
  testConnection,
} from "./commands/server.js";
import {
  installService,
  listServerServicesCommand,
  listServicesCommand,
  removeService,
  serviceStatusCommand,
} from "./commands/service.js";
import { getConfigValue, setConfigValue } from "./core/config-store.js";

const program = new Command();

// Helper function to collect multiple option values
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

program
  .name("bun-deploy")
  .description("CLI tool for managing Ubuntu servers and deploying Bun.js applications")
  .version("0.1.0");

// Server commands
const serverCmd = program.command("server").description("Manage servers");

serverCmd
  .command("add <name>")
  .description("Add a new server")
  .requiredOption("--host <host>", "Server IP address or hostname")
  .option("--port <port>", "SSH port", "22")
  .option("--user <user>", "SSH username", "root")
  .option("--key <path>", "Path to SSH private key")
  .option("--passphrase <passphrase>", "SSH key passphrase")
  .action(async (name, options) => {
    await addServer(name, options);
  });

serverCmd
  .command("list")
  .description("List all configured servers")
  .action(async () => {
    await listServersCommand();
  });

serverCmd
  .command("remove <name>")
  .description("Remove a server from configuration")
  .option("--force", "Skip confirmation prompt")
  .action(async (name, options) => {
    await removeServerCommand(name, options.force);
  });

serverCmd
  .command("setup <name>")
  .description("Provision a blank Ubuntu 24.04 server")
  .option("--force", "Re-run provisioning even if server is already ready")
  .action(async (name, options) => {
    // Pass force flag via argv for now
    if (options.force && !process.argv.includes("--force")) {
      process.argv.push("--force");
    }
    await setupServer(name);
  });

serverCmd
  .command("test <name>")
  .description("Test SSH connection to a server")
  .action(async (name) => {
    await testConnection(name);
  });

// Provider commands - unified interface for all cloud providers
const providerCmd = program.command("provider").description("Manage cloud providers");

providerCmd
  .command("status")
  .description("Check all provider statuses")
  .action(async () => {
    await providerStatus();
  });

providerCmd
  .command("configure <provider>")
  .description("Configure a cloud provider with credentials")
  .option("--token <token>", "API token (for providers that use tokens)")
  .option("--key <key>", "API key (for providers that use keys)")
  .option("--secret <secret>", "API secret (for providers that use key+secret)")
  .option("--region <region>", "Default region")
  .action(async (provider, options) => {
    const credentials: Record<string, string> = {};
    if (options.token) credentials.token = options.token;
    if (options.key) credentials.key = options.key;
    if (options.secret) credentials.secret = options.secret;
    if (options.region) credentials.region = options.region;
    await configureProvider(provider, credentials);
  });

providerCmd
  .command("list [provider]")
  .description("List cloud servers from all or a specific provider")
  .action(async (provider) => {
    await listProviderServers(provider);
  });

providerCmd
  .command("create <provider> <name>")
  .description("Create a new cloud server")
  .option("--type <type>", "Server/instance type")
  .option("--location <location>", "Datacenter location/region")
  .option("--image <image>", "OS image")
  .option("--ssh-key <name>", "SSH key name to add")
  .option("--label <label>", "Labels to add (key=value, can be used multiple times)", collect, [])
  .action(async (provider, name, options) => {
    await createProviderServer(provider, name, options);
  });

providerCmd
  .command("delete <provider> <identifier>")
  .description("Delete a cloud server by name or ID")
  .option("--force", "Skip confirmation prompt")
  .action(async (provider, identifier, options) => {
    await deleteProviderServer(provider, identifier, options.force);
  });

providerCmd
  .command("sync [provider]")
  .description("Sync cloud servers to local configuration")
  .option("--prefix <prefix>", "Only sync servers with names starting with this prefix")
  .action(async (provider, options) => {
    await syncProviderServers(provider, options.prefix);
  });

// App commands
const appCmd = program.command("app").description("Manage applications");

appCmd
  .command("create <name>")
  .description("Create a new app")
  .requiredOption("--server <name>", "Server to deploy to")
  .requiredOption("--repo <url>", "Git repository URL")
  .option("--type <type>", "App type (bun-app, laravel-app)", "bun-app")
  .option("--branch <branch>", "Git branch to deploy", "main")
  .option("--domain <domain>", "Domain name for the app")
  .option("--port <port>", "Internal port for the app")
  .action(async (name, options) => {
    await createApp(name, options);
  });

appCmd
  .command("list")
  .description("List all configured apps")
  .action(async () => {
    await listAppsCommand();
  });

appCmd
  .command("deploy <name>")
  .description("Deploy an app")
  .action(async (name) => {
    await deployApp(name);
  });

appCmd
  .command("remove <name>")
  .description("Remove an app from configuration")
  .option("--force", "Skip confirmation prompt")
  .action(async (name, options) => {
    await removeAppCommand(name, options.force);
  });

appCmd
  .command("env <name> [action] [key] [value]")
  .description("Manage environment variables for an app")
  .action(async (name, action, key, value) => {
    await manageEnv(name, action, key, value);
  });

appCmd
  .command("logs <name>")
  .description("View app logs")
  .option("--follow, -f", "Follow log output")
  .action(async (name, options) => {
    await streamLogs(name, options.follow);
  });

// Service commands
const serviceCmd = program.command("service").description("Manage server services");

serviceCmd
  .command("list")
  .description("List available services")
  .action(async () => {
    await listServicesCommand();
  });

serviceCmd
  .command("install <server> <service>")
  .description("Install a service on a server")
  .option("--port <port>", "Custom port for the service")
  .option("--version <version>", "Specific version to install")
  .action(async (server, service, options) => {
    await installService(server, service, options);
  });

serviceCmd
  .command("remove <server> <service>")
  .description("Remove a service from a server")
  .option("--force", "Skip confirmation prompt")
  .action(async (server, service, options) => {
    await removeService(server, service, options.force);
  });

serviceCmd
  .command("status <server>")
  .description("Show service status for a server")
  .action(async (server) => {
    await serviceStatusCommand(server);
  });

serviceCmd
  .command("ls <server>")
  .description("List services installed on a server")
  .action(async (server) => {
    await listServerServicesCommand(server);
  });

// Config commands
const configCmd = program.command("config").description("Manage global configuration");

configCmd
  .command("get <key>")
  .description("Get a configuration value")
  .action(async (key) => {
    const value = await getConfigValue(key);
    if (value !== undefined) {
      console.log(value);
    } else {
      console.error(`Configuration key '${key}' not found.`);
      process.exit(1);
    }
  });

configCmd
  .command("set <key> <value>")
  .description("Set a configuration value")
  .action(async (key, value) => {
    await setConfigValue(key, value);
    console.log(`Set ${key}=${value}`);
  });

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
