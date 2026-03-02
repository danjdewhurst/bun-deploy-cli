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
  addServer,
  listServersCommand,
  removeServerCommand,
  setupServer,
  testConnection,
} from "./commands/server.js";
import { getConfigValue, setConfigValue } from "./core/config-store.js";

const program = new Command();

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
