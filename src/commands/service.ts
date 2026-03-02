/**
 * Service Commands - `bun-deploy service install|remove|list|status`
 */
import { getServer, saveServer } from "../core/config-store.js";
import { withServer } from "../core/ssh-client.js";
import { getServiceHandler, listServices, serviceExists } from "../services/index.js";
import type { ServiceConfig } from "../types/index.js";

interface InstallServiceOptions {
  port?: string;
  version?: string;
}

export async function installService(
  serverName: string,
  serviceName: string,
  options: InstallServiceOptions,
): Promise<void> {
  const server = await getServer(serverName);

  if (!server) {
    console.error(`Error: Server '${serverName}' not found.`);
    process.exit(1);
  }

  if (server.state !== "ready") {
    console.error(
      `Error: Server '${serverName}' is not ready. Run 'bun-deploy server setup ${serverName}' first.`,
    );
    process.exit(1);
  }

  if (!serviceExists(serviceName)) {
    console.error(`Error: Unknown service '${serviceName}'.`);
    console.error("Run 'bun-deploy service list' to see available services.");
    process.exit(1);
  }

  const handler = getServiceHandler(serviceName)!;

  if (await handler.isInstalled(server)) {
    console.error(`Error: Service '${serviceName}' is already installed on '${serverName}'.`);
    process.exit(1);
  }

  const serviceConfig: ServiceConfig = {
    name: serviceName,
    version: options.version,
    port: options.port ? parseInt(options.port, 10) : handler.defaultPort,
  };

  console.log(`Installing ${handler.name} on ${serverName}...`);

  // Generate installation result (includes scripts)
  const result = await handler.install(server, serviceConfig);

  if (!result.success) {
    console.error(`Installation failed: ${result.message}`);
    process.exit(1);
  }

  // Execute installation via SSH
  await withServer(server, async (client) => {
    const timestamp = Date.now();
    const remoteScriptPath = `/tmp/install-${serviceName}-${timestamp}.sh`;

    // Generate the actual install script from the handler
    const installScript = handler.generateInstallScript(serviceConfig);

    console.log("Uploading installation script...");
    await client.uploadContent(installScript, remoteScriptPath);

    console.log("Running installation (this may take a few minutes)...");
    const execResult = await client.exec(`bash ${remoteScriptPath}`);

    // Clean up
    await client.exec(`rm -f ${remoteScriptPath}`);

    if (execResult.code !== 0) {
      throw new Error(`Installation failed: ${execResult.stderr}`);
    }

    console.log(execResult.stdout);

    // Install systemd service
    console.log("Setting up systemd service...");
    const systemdContent = handler.generateSystemdService(serviceConfig);
    const systemdPath = `/etc/systemd/system/${serviceName}.service`;

    await client.uploadContent(systemdContent, `/tmp/${serviceName}.service`);
    await client.exec(`sudo mv /tmp/${serviceName}.service ${systemdPath}`);

    // Run post-install commands
    const postCommands = handler.getPostInstallCommands(serviceConfig);
    for (const cmd of postCommands) {
      await client.exec(`sudo ${cmd}`);
    }

    // Update server configuration
    if (!server.installedServices.includes(serviceName)) {
      server.installedServices.push(serviceName);
      await saveServer(server);
    }
  });

  console.log(`\n✓ ${handler.name} installed successfully on ${serverName}`);
  console.log(`  Port: ${result.port}`);
  if (result.credentials) {
    console.log("  Credentials:");
    for (const [key, value] of Object.entries(result.credentials)) {
      console.log(`    ${key}: ${value}`);
    }
  }

  // Display connection environment variables
  const envVars = handler.getConnectionEnv(server, serviceConfig);
  console.log("\n  Connection environment variables:");
  for (const [key, value] of Object.entries(envVars)) {
    console.log(`    ${key}=${value}`);
  }
}

export async function removeService(
  serverName: string,
  serviceName: string,
  force = false,
): Promise<void> {
  const server = await getServer(serverName);

  if (!server) {
    console.error(`Error: Server '${serverName}' not found.`);
    process.exit(1);
  }

  if (!serviceExists(serviceName)) {
    console.error(`Error: Unknown service '${serviceName}'.`);
    process.exit(1);
  }

  const handler = getServiceHandler(serviceName)!;

  if (!(await handler.isInstalled(server))) {
    console.error(`Error: Service '${serviceName}' is not installed on '${serverName}'.`);
    process.exit(1);
  }

  if (!force) {
    console.log(`Are you sure you want to remove '${serviceName}' from server '${serverName}'?`);
    console.log("This will delete all data associated with this service.");
    console.log("Use --force to skip this confirmation.");
    process.exit(1);
  }

  console.log(`Removing ${handler.name} from ${serverName}...`);

  const result = await handler.remove(server);

  if (!result.success) {
    console.error(`Removal failed: ${result.message}`);
    process.exit(1);
  }

  // Execute removal via SSH
  await withServer(server, async (client) => {
    const removeScript = handler.generateRemoveScript();
    const timestamp = Date.now();
    const remoteScriptPath = `/tmp/remove-${serviceName}-${timestamp}.sh`;

    await client.uploadContent(removeScript, remoteScriptPath);

    const execResult = await client.exec(`sudo bash ${remoteScriptPath}`);

    await client.exec(`rm -f ${remoteScriptPath}`);

    if (execResult.code !== 0) {
      throw new Error(`Removal failed: ${execResult.stderr}`);
    }

    // Remove from server configuration
    server.installedServices = server.installedServices.filter((s) => s !== serviceName);
    await saveServer(server);
  });

  console.log(`\n✓ ${handler.name} removed from ${serverName}`);
}

export async function listServicesCommand(): Promise<void> {
  const services = listServices();

  if (services.length === 0) {
    console.log("No services available.");
    return;
  }

  console.log("\nAvailable Services:");
  console.log("=".repeat(70));
  console.log(`${"Name".padEnd(15)} ${"Category".padEnd(12)} ${"Port".padEnd(8)} ${"Description"}`);
  console.log("-".repeat(70));

  for (const service of services) {
    console.log(
      `${service.name.padEnd(15)} ${service.category.padEnd(12)} ${String(service.defaultPort).padEnd(8)} ${service.description}`,
    );
  }

  console.log("=".repeat(70));
  console.log("\nUsage:");
  console.log("  bun-deploy service install <server> <service> [--port <port>]");
  console.log("  bun-deploy service remove <server> <service>");
  console.log("  bun-deploy service status <server>");
  console.log();
}

export async function listServerServicesCommand(serverName: string): Promise<void> {
  const server = await getServer(serverName);

  if (!server) {
    console.error(`Error: Server '${serverName}' not found.`);
    process.exit(1);
  }

  if (server.installedServices.length === 0) {
    console.log(`No services installed on '${serverName}'.`);
    console.log("Run 'bun-deploy service list' to see available services.");
    return;
  }

  console.log(`\nServices installed on '${serverName}':`);
  console.log("=".repeat(60));

  await withServer(server, async (client) => {
    for (const serviceName of server.installedServices) {
      const handler = getServiceHandler(serviceName);
      if (!handler) {
        console.log(`  ${serviceName} (unknown service)`);
        continue;
      }

      const status = await getServiceStatus(client, serviceName);
      const statusIcon = status.running ? "●" : "○";
      const statusColor = status.running ? "\x1b[32m" : "\x1b[31m";
      const resetColor = "\x1b[0m";

      console.log(
        `  ${statusColor}${statusIcon}${resetColor} ${handler.name} - ${handler.description}`,
      );
      console.log(`      Port: ${handler.defaultPort}`);
      console.log(`      Status: ${status.running ? "running" : "stopped"}`);
      if (status.version) {
        console.log(`      Version: ${status.version}`);
      }
    }
  });

  console.log("=".repeat(60));
}

export async function serviceStatusCommand(serverName: string): Promise<void> {
  const server = await getServer(serverName);

  if (!server) {
    console.error(`Error: Server '${serverName}' not found.`);
    process.exit(1);
  }

  console.log(`\nService Status for '${serverName}':`);
  console.log("=".repeat(60));

  if (server.installedServices.length === 0) {
    console.log("No services installed.");
    console.log("\nAvailable services:");
    const available = listServices();
    for (const service of available) {
      console.log(`  - ${service.name}: ${service.description}`);
    }
  } else {
    await withServer(server, async (client) => {
      for (const serviceName of server.installedServices) {
        const handler = getServiceHandler(serviceName);
        if (!handler) continue;

        const status = await getServiceStatus(client, serviceName);
        const statusStr = status.running ? "running" : "stopped";
        const statusColor = status.running ? "\x1b[32m" : "\x1b[31m";

        console.log(`${handler.name}:`);
        console.log(`  Status: ${statusColor}${statusStr}\x1b[0m`);
        console.log(`  Port: ${status.port || handler.defaultPort}`);
        if (status.version) {
          console.log(`  Version: ${status.version}`);
        }
        if (status.uptime) {
          console.log(`  Uptime: ${status.uptime}`);
        }
        console.log();
      }
    });
  }

  console.log("=".repeat(60));
}

// Helper functions

async function getServiceStatus(
  client: { exec: (cmd: string) => Promise<{ stdout: string; code: number }> },
  serviceName: string,
): Promise<{ running: boolean; version?: string; port?: number; uptime?: string }> {
  const result = await client.exec(`systemctl is-active ${serviceName}`);
  const running = result.stdout.trim() === "active";

  // Try to get version
  let version: string | undefined;
  const versionResult = await client.exec(`${serviceName} --version 2>/dev/null || echo ""`);
  if (versionResult.stdout.trim()) {
    version = versionResult.stdout.trim().split("\n")[0];
  }

  return { running, version };
}
