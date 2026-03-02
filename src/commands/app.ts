/**
 * App Commands - `bun-deploy app create|deploy|logs|env|remove`
 */

import { getAppTypeHandler } from "../app-types/index.js";
import {
  appExists,
  getApp,
  getServer,
  listApps,
  listAppsByServer,
  removeApp,
  saveApp,
} from "../core/config-store.js";
import { withServer } from "../core/ssh-client.js";
import type { AppConfig, DeployResult } from "../types/index.js";

interface CreateAppOptions {
  server: string;
  repo: string;
  type?: string;
  branch?: string;
  domain?: string;
  port?: string;
}

export async function createApp(name: string, options: CreateAppOptions): Promise<void> {
  if (await appExists(name)) {
    console.error(`Error: App '${name}' already exists.`);
    process.exit(1);
  }

  const server = await getServer(options.server);
  if (!server) {
    console.error(`Error: Server '${options.server}' not found.`);
    process.exit(1);
  }

  if (server.state !== "ready") {
    console.error(
      `Error: Server '${options.server}' is not provisioned. Run 'bun-deploy server setup ${options.server}' first.`,
    );
    process.exit(1);
  }

  const appType = options.type || "bun-app";

  // Validate app type
  const handler = getAppTypeHandler(appType);
  if (!handler) {
    console.error(`Error: Unknown app type '${appType}'.`);
    console.error("Supported types: bun-app");
    process.exit(1);
  }

  const appConfig: AppConfig = {
    name,
    serverName: options.server,
    appType,
    gitRepo: options.repo,
    gitBranch: options.branch || "main",
    domain: options.domain,
    envVars: {},
    port: options.port ? parseInt(options.port, 10) : 3000,
  };

  // Validate the configuration
  const valid = await handler.validate(appConfig);
  if (!valid) {
    console.error("Error: App configuration validation failed.");
    process.exit(1);
  }

  await saveApp(appConfig);
  console.log(`App '${name}' created successfully.`);
  console.log(`Server: ${options.server}`);
  console.log(`Repository: ${options.repo}`);
  console.log(`Branch: ${appConfig.gitBranch}`);
  console.log(`\nRun 'bun-deploy app deploy ${name}' to deploy.`);
}

export async function listAppsCommand(): Promise<void> {
  const apps = await listApps();

  if (apps.length === 0) {
    console.log(
      "No apps configured. Create one with: bun-deploy app create <name> --server <name> --repo <git-url>",
    );
    return;
  }

  console.log("\nConfigured Apps:");
  console.log("=".repeat(100));
  console.log(
    `${"Name".padEnd(15)} ${"Server".padEnd(12)} ${"Type".padEnd(10)} ${"Branch".padEnd(12)} ${"Port".padEnd(6)} ${"Domain".padEnd(20)} ${"Last Deployed"}`,
  );
  console.log("-".repeat(100));

  for (const app of apps) {
    const lastDeployed = app.lastDeployedAt
      ? new Date(app.lastDeployedAt).toLocaleDateString()
      : "Never";
    const domain = app.domain || "-";
    console.log(
      `${app.name.padEnd(15)} ${app.serverName.padEnd(12)} ${app.appType.padEnd(10)} ${app.gitBranch.padEnd(12)} ${String(app.port).padEnd(6)} ${domain.padEnd(20)} ${lastDeployed}`,
    );
  }

  console.log("=".repeat(100));
  console.log();
}

export async function deployApp(name: string): Promise<void> {
  const app = await getApp(name);

  if (!app) {
    console.error(`Error: App '${name}' not found.`);
    process.exit(1);
  }

  const server = await getServer(app.serverName);
  if (!server) {
    console.error(`Error: Server '${app.serverName}' not found.`);
    process.exit(1);
  }

  const handler = getAppTypeHandler(app.appType);
  if (!handler) {
    console.error(`Error: Unknown app type '${app.appType}'.`);
    process.exit(1);
  }

  console.log(`\nDeploying app '${name}' to ${server.host}...\n`);

  try {
    const result = await withServer(server, async (client) => {
      const appDir = `/var/www/${app.name}`;

      // Step 1: Ensure app directory exists
      console.log("Setting up app directory...");
      await client.exec(`sudo mkdir -p ${appDir}`);
      await client.exec(`sudo chown deploy:deploy ${appDir}`);

      // Step 2: Clone or pull the repository
      console.log("Fetching code...");
      const checkDir = await client.exec(`test -d ${appDir}/.git && echo "exists"`);
      const dirExists = checkDir.stdout.trim() === "exists";

      if (dirExists) {
        // Pull latest changes
        const pullResult = await client.exec(
          `cd ${appDir} && sudo -u deploy git fetch origin && sudo -u deploy git reset --hard origin/${app.gitBranch}`,
        );
        if (pullResult.code !== 0) {
          throw new Error(`Git pull failed: ${pullResult.stderr}`);
        }
      } else {
        // Clone the repository
        const cloneResult = await client.exec(
          `sudo -u deploy git clone -b ${app.gitBranch} ${app.gitRepo} ${appDir}`,
        );
        if (cloneResult.code !== 0) {
          throw new Error(`Git clone failed: ${cloneResult.stderr}`);
        }
      }

      // Get current commit hash
      const commitResult = await client.exec(
        `cd ${appDir} && sudo -u deploy git rev-parse --short HEAD`,
      );
      const commitHash = commitResult.stdout.trim();

      // Step 3: Write environment variables
      console.log("Setting up environment variables...");
      const envContent = Object.entries(app.envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
      await client.uploadContent(envContent, `/tmp/${app.name}.env`);
      await client.exec(
        `sudo mv /tmp/${app.name}.env ${appDir}/.env && sudo chown deploy:deploy ${appDir}/.env`,
      );

      // Step 4: Setup (first time only)
      if (!app.lastDeployedAt) {
        console.log("Running first-time setup...");
        const setupCommands = handler.getSetupCommands(app);
        for (const cmd of setupCommands) {
          const setupResult = await client.exec(cmd);
          if (setupResult.code !== 0) {
            console.warn(`Setup command warning: ${setupResult.stderr}`);
          }
        }
      }

      // Step 5: Execute deployment script
      console.log("Running deployment script...");
      const deployScript = handler.generateDeployScript(app);
      await client.uploadContent(deployScript, `/tmp/deploy-${app.name}.sh`);
      await client.exec(`chmod +x /tmp/deploy-${app.name}.sh`);

      const deployResult = await client.exec(
        `cd ${appDir} && sudo -u deploy /tmp/deploy-${app.name}.sh`,
      );
      await client.exec(`rm -f /tmp/deploy-${app.name}.sh`);

      if (deployResult.code !== 0) {
        throw new Error(`Deployment script failed: ${deployResult.stderr}`);
      }

      // Step 6: Configure systemd service
      console.log("Configuring service...");
      const serviceFile = handler.generateSystemdService(app);
      await client.uploadContent(serviceFile, `/tmp/${app.name}.service`);
      await client.exec(
        `sudo mv /tmp/${app.name}.service /etc/systemd/system/bun-deploy-${app.name}.service`,
      );
      await client.exec("sudo systemctl daemon-reload");
      await client.exec(`sudo systemctl enable bun-deploy-${app.name}`);
      await client.exec(`sudo systemctl restart bun-deploy-${app.name}`);

      // Step 7: Configure Nginx
      console.log("Configuring Nginx...");
      const nginxConfig = handler.generateNginxConfig(app);
      await client.uploadContent(nginxConfig, `/tmp/${app.name}.nginx`);
      await client.exec(`sudo mv /tmp/${app.name}.nginx /etc/nginx/sites-available/${app.name}`);
      await client.exec(
        `sudo ln -sf /etc/nginx/sites-available/${app.name} /etc/nginx/sites-enabled/`,
      );

      // Test Nginx config
      const nginxTest = await client.exec("sudo nginx -t");
      if (nginxTest.code !== 0) {
        throw new Error(`Nginx configuration test failed: ${nginxTest.stderr}`);
      }

      await client.exec("sudo systemctl reload nginx");

      // Step 8: Health check
      console.log("Running health check...");
      const healthCheck = handler.getHealthCheck(app);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for app to start

      const healthResult = await client.exec(
        `curl -sf http://localhost:${app.port}${healthCheck.path} -o /dev/null && echo "OK" || echo "FAIL"`,
      );

      if (healthResult.stdout.trim() !== "OK") {
        console.warn("Warning: Health check did not pass. Check app logs.");
      } else {
        console.log("Health check passed!");
      }

      return {
        success: true,
        message: "Deployment successful",
        commit: commitHash,
      } as DeployResult;
    });

    // Update app config with deployment metadata
    app.lastDeployedAt = new Date().toISOString();
    app.lastCommit = result.commit;
    await saveApp(app);

    console.log(`\nDeployment complete!`);
    if (result.commit) {
      console.log(`Commit: ${result.commit}`);
    }
    console.log(
      `App is running at: http://${app.domain || server.host}:${app.port === 80 ? "" : app.port}`,
    );
  } catch (error) {
    console.error(`\nDeployment failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export async function removeAppCommand(name: string, force = false): Promise<void> {
  const app = await getApp(name);

  if (!app) {
    console.error(`Error: App '${name}' not found.`);
    process.exit(1);
  }

  if (!force) {
    console.log(
      `Are you sure you want to remove app '${name}'? This will not delete the deployed app from the server, only the local configuration.`,
    );
    console.log("Use --force to skip this confirmation.");
    process.exit(1);
  }

  const removed = await removeApp(name);

  if (removed) {
    console.log(`App '${name}' removed from configuration.`);
  } else {
    console.error(`Failed to remove app '${name}'.`);
    process.exit(1);
  }
}

export async function manageEnv(
  name: string,
  action?: string,
  key?: string,
  value?: string,
): Promise<void> {
  const app = await getApp(name);

  if (!app) {
    console.error(`Error: App '${name}' not found.`);
    process.exit(1);
  }

  if (!action || action === "list") {
    // List environment variables
    console.log(`\nEnvironment variables for '${name}':`);
    console.log("=".repeat(40));
    const entries = Object.entries(app.envVars);
    if (entries.length === 0) {
      console.log("No environment variables set.");
    } else {
      for (const [k, v] of entries) {
        console.log(`${k}=${v}`);
      }
    }
    console.log("=".repeat(40));
    console.log("\nUse 'bun-deploy app env <name> set <key> <value>' to add/update.");
    console.log("Use 'bun-deploy app env <name> unset <key>' to remove.");
    return;
  }

  if (action === "set") {
    if (!key || value === undefined) {
      console.error("Error: Usage: bun-deploy app env <name> set <key> <value>");
      process.exit(1);
    }

    app.envVars[key] = value;
    await saveApp(app);
    console.log(`Set ${key}=${value} for app '${name}'.`);
    console.log("Run 'bun-deploy app deploy' to apply changes.");
    return;
  }

  if (action === "unset") {
    if (!key) {
      console.error("Error: Usage: bun-deploy app env <name> unset <key>");
      process.exit(1);
    }

    delete app.envVars[key];
    await saveApp(app);
    console.log(`Removed ${key} from app '${name}'.`);
    console.log("Run 'bun-deploy app deploy' to apply changes.");
    return;
  }

  console.error(`Error: Unknown env action '${action}'. Use: list, set, unset`);
  process.exit(1);
}

export async function streamLogs(name: string, follow = false): Promise<void> {
  const app = await getApp(name);

  if (!app) {
    console.error(`Error: App '${name}' not found.`);
    process.exit(1);
  }

  const server = await getServer(app.serverName);
  if (!server) {
    console.error(`Error: Server '${app.serverName}' not found.`);
    process.exit(1);
  }

  const serviceName = `bun-deploy-${app.name}`;

  try {
    await withServer(server, async (client) => {
      console.log(
        follow ? `Streaming logs for '${name}' (Ctrl+C to stop)...\n` : `Logs for '${name}':\n`,
      );
      await client.streamLogs(serviceName, follow);
    });
  } catch (error) {
    console.error(
      `Failed to fetch logs: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
