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

    // Generate the actual install script
    const installScript = generateInstallScript(handler, serviceConfig);

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
    const removeScript = generateRemoveScript(handler, serviceName);
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

function generateInstallScript(
  handler: ReturnType<typeof getServiceHandler>,
  config: ServiceConfig,
): string {
  if (!handler) throw new Error("Handler is required");

  // Generate the install script based on the service type
  switch (handler.name) {
    case "bun":
      return generateBunInstallScript(config);
    case "caddy":
      return generateCaddyInstallScript(config);
    case "redis":
      return generateRedisInstallScript(config);
    case "mariadb":
      return generateMariaDBInstallScript(config);
    case "meilisearch":
      return generateMeilisearchInstallScript(config);
    case "minio":
      return generateMinioInstallScript(config);
    default:
      throw new Error(`Unknown service: ${handler.name}`);
  }
}

function generateBunInstallScript(_config: ServiceConfig): string {
  return `#!/bin/bash
set -e

echo "Installing Bun..."

# Install Bun
export BUN_INSTALL=/usr/local
curl -fsSL https://bun.sh/install | bash

# Ensure bun is in PATH
ln -sf /usr/local/bin/bun /usr/local/bin/bun 2>/dev/null || true

# Verify installation
if /usr/local/bin/bun --version; then
    echo "Bun installed successfully"
else
    echo "Bun installation may have failed"
    exit 1
fi

echo "Bun installation complete"
`;
}

function generateCaddyInstallScript(config: ServiceConfig): string {
  const port = config.port ?? 80;

  return `#!/bin/bash
set -e

echo "Installing Caddy..."

# Install dependencies
apt-get update -qq
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https

# Add Caddy's official repository
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list

# Install Caddy
apt-get update -qq
apt-get install -y -qq caddy

# Create Caddy user if not exists
if ! id "caddy" &>/dev/null; then
    useradd --system --home /var/lib/caddy --shell /usr/sbin/nologin caddy
fi

# Set up Caddy directories
mkdir -p /etc/caddy/sites
mkdir -p /var/lib/caddy
mkdir -p /var/log/caddy
chown -R caddy:caddy /var/lib/caddy /var/log/caddy

# Create main Caddyfile
cat > /etc/caddy/Caddyfile << 'EOF'
# Main Caddyfile - imports all site configurations
import /etc/caddy/sites/*.Caddyfile
EOF

chown caddy:caddy /etc/caddy/Caddyfile

# Allow deploy user to reload Caddy
echo "deploy ALL=(ALL) NOPASSWD: /usr/bin/caddy" > /etc/sudoers.d/bun-deploy-caddy

systemctl daemon-reload
systemctl enable caddy
systemctl start caddy

echo "Caddy installed and running on port ${port}"
`;
}

function generateRedisInstallScript(config: ServiceConfig): string {
  const port = config.port ?? 6379;

  return `#!/bin/bash
set -e

echo "Installing Redis..."

# Install Redis
apt-get update -qq
apt-get install -y -qq redis-server

# Configure Redis
cat > /etc/redis/redis.conf << 'EOF'
port ${port}
bind 127.0.0.1
supervised systemd
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
databases 16
loglevel notice
logfile /var/log/redis/redis-server.log
pidfile /run/redis/redis-server.pid
EOF

chown redis:redis /etc/redis/redis.conf

# Create systemd override for port
mkdir -p /etc/systemd/system/redis-server.service.d
cat > /etc/systemd/system/redis-server.service.d/override.conf << 'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/redis-server /etc/redis/redis.conf
EOF

systemctl daemon-reload
systemctl enable redis-server
systemctl restart redis-server

echo "Redis installation complete"
`;
}

function generateMariaDBInstallScript(config: ServiceConfig): string {
  const port = config.port ?? 3306;
  const rootPassword = generatePassword();

  return `#!/bin/bash
set -e

echo "Installing MariaDB..."

apt-get update -qq
apt-get install -y -qq mariadb-server mariadb-client

# Secure installation
cat > /tmp/mysql-secure.sql << 'EOF'
ALTER USER 'root'@'localhost' IDENTIFIED BY '${rootPassword}';
DELETE FROM mysql.user WHERE User='';
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
EOF

mysql -u root < /tmp/mysql-secure.sql
rm -f /tmp/mysql-secure.sql

# Store credentials
echo "root_password=${rootPassword}" > /etc/mysql/bun-deploy-credentials.env
chmod 600 /etc/mysql/bun-deploy-credentials.env

# Configure bind address
cat > /etc/mysql/conf.d/bun-deploy.cnf << 'EOF'
[mysqld]
bind-address = 127.0.0.1
port = ${port}
max_connections = 100
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
default_storage_engine = InnoDB
innodb_buffer_pool_size = 256M
EOF

chmod 644 /etc/mysql/conf.d/bun-deploy.cnf
systemctl restart mariadb

echo "MariaDB root password: ${rootPassword}"
echo "MariaDB installation complete"
`;
}

function generateMeilisearchInstallScript(config: ServiceConfig): string {
  const port = config.port ?? 7700;
  const apiKey = generateApiKey();

  return `#!/bin/bash
set -e

echo "Installing Meilisearch..."

# Create meilisearch user
if ! id "meilisearch" &>/dev/null; then
    useradd -r -s /bin/false -d /var/lib/meilisearch -m meilisearch
fi

# Download latest Meilisearch
MEILI_VERSION=$(curl -s https://api.github.com/repos/meilisearch/meilisearch/releases/latest | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\\1/')
curl -L "https://github.com/meilisearch/meilisearch/releases/download/v\${MEILI_VERSION}/meilisearch-linux-amd64" -o /usr/local/bin/meilisearch
chmod +x /usr/local/bin/meilisearch

# Create directories
mkdir -p /var/lib/meilisearch/data /var/log/meilisearch
chown -R meilisearch:meilisearch /var/lib/meilisearch /var/log/meilisearch

# Create environment file
cat > /etc/meilisearch.env << EOF
MEILI_HTTP_ADDR=127.0.0.1:${port}
MEILI_MASTER_KEY=${apiKey}
MEILI_DB_PATH=/var/lib/meilisearch/data
MEILI_LOG_LEVEL=info
MEILI_ENV=production
EOF

chmod 600 /etc/meilisearch.env
chown meilisearch:meilisearch /etc/meilisearch.env

# Store API key
echo "api_key=${apiKey}" > /etc/meilisearch/bun-deploy-credentials.env
chmod 600 /etc/meilisearch/bun-deploy-credentials.env

echo "Meilisearch API key: ${apiKey}"
echo "Meilisearch installation complete"
`;
}

function generateMinioInstallScript(config: ServiceConfig): string {
  const port = config.port ?? 9000;
  const consolePort = 9001;
  const rootUser = (config.options?.rootUser as string) ?? "minioadmin";
  const rootPassword = generatePassword();

  return `#!/bin/bash
set -e

echo "Installing MinIO..."

# Create minio-user
if ! id "minio-user" &>/dev/null; then
    useradd -r -s /bin/false -d /var/lib/minio minio-user
fi

# Download MinIO binary
curl -L "https://dl.min.io/server/minio/release/linux-amd64/minio" -o /usr/local/bin/minio
chmod +x /usr/local/bin/minio

# Download MinIO client
curl -L "https://dl.min.io/client/mc/release/linux-amd64/mc" -o /usr/local/bin/mc
chmod +x /usr/local/bin/mc

# Create data directory
mkdir -p /var/lib/minio/data
chown -R minio-user:minio-user /var/lib/minio

# Create environment file
cat > /etc/default/minio << EOF
MINIO_ROOT_USER=${rootUser}
MINIO_ROOT_PASSWORD=${rootPassword}
MINIO_VOLUMES=/var/lib/minio/data
MINIO_OPTS="--address :${port} --console-address :${consolePort}"
EOF

chmod 600 /etc/default/minio

# Store credentials
echo "root_user=${rootUser}" > /etc/minio-credentials.env
echo "root_password=${rootPassword}" >> /etc/minio-credentials.env
chmod 600 /etc/minio-credentials.env

echo "MinIO root user: ${rootUser}"
echo "MinIO root password: ${rootPassword}"
echo "MinIO installation complete"
`;
}

function generateRemoveScript(
  handler: ReturnType<typeof getServiceHandler>,
  serviceName: string,
): string {
  if (!handler) throw new Error("Handler is required");

  switch (handler.name) {
    case "bun":
      return `#!/bin/bash
set -e
rm -f /usr/local/bin/bun
rm -rf /usr/local/bin/bun /usr/local/bun
rm -rf ~/.bun
`;

    case "caddy":
      return `#!/bin/bash
set -e
systemctl stop caddy || true
systemctl disable caddy || true
apt-get remove -y caddy || true
apt-get autoremove -y || true
rm -rf /etc/caddy /var/lib/caddy /var/log/caddy
rm -f /etc/apt/sources.list.d/caddy-stable.list
rm -f /etc/sudoers.d/bun-deploy-caddy
userdel caddy 2>/dev/null || true
systemctl daemon-reload
`;

    case "redis":
      return `#!/bin/bash
set -e
systemctl stop redis-server || true
systemctl disable redis-server || true
apt-get remove -y redis-server || true
apt-get autoremove -y || true
rm -rf /etc/redis /var/log/redis /var/lib/redis
userdel redis 2>/dev/null || true
`;

    case "mariadb":
      return `#!/bin/bash
set -e
systemctl stop mariadb || true
systemctl disable mariadb || true
apt-get remove -y mariadb-server mariadb-client || true
apt-get autoremove -y || true
rm -rf /etc/mysql /var/lib/mysql /var/log/mysql
userdel mysql 2>/dev/null || true
`;

    case "meilisearch":
      return `#!/bin/bash
set -e
systemctl stop meilisearch || true
systemctl disable meilisearch || true
rm -f /etc/systemd/system/meilisearch.service
rm -f /usr/local/bin/meilisearch
rm -rf /var/lib/meilisearch /etc/meilisearch /var/log/meilisearch
userdel meilisearch 2>/dev/null || true
systemctl daemon-reload
`;

    case "minio":
      return `#!/bin/bash
set -e
systemctl stop minio || true
systemctl disable minio || true
rm -f /etc/systemd/system/minio.service
rm -f /usr/local/bin/minio /usr/local/bin/mc
rm -rf /var/lib/minio /etc/default/minio
userdel minio-user 2>/dev/null || true
systemctl daemon-reload
`;

    default:
      return `#!/bin/bash
echo "Removing ${serviceName}..."
systemctl stop ${serviceName} || true
systemctl disable ${serviceName} || true
`;
  }
}

function generatePassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < 24; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}
