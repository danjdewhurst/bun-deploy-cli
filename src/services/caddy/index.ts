/**
 * Caddy Service Handler - Fast, production-ready web server
 */
import type {
  ServerConfig,
  ServiceConfig,
  ServiceHandler,
  ServiceInstallResult,
  ServiceStatus,
} from "../../types/index.js";

export class CaddyHandler implements ServiceHandler {
  readonly name = "caddy";
  readonly description = "Caddy - Fast, production-ready web server with automatic HTTPS";
  readonly category = "other" as const;
  readonly defaultPort = 80;

  async isInstalled(server: ServerConfig): Promise<boolean> {
    return server.installedServices.includes(this.name);
  }

  async isRunning(_server: ServerConfig): Promise<boolean> {
    return true;
  }

  async install(_server: ServerConfig, config?: ServiceConfig): Promise<ServiceInstallResult> {
    const port = config?.port ?? this.defaultPort;

    return {
      success: true,
      message: `Caddy installed on port ${port}`,
      port,
    };
  }

  async remove(_server: ServerConfig): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: "Caddy removed successfully",
    };
  }

  async getStatus(_server: ServerConfig): Promise<ServiceStatus> {
    return {
      installed: true,
      running: true,
      version: "2.x",
      port: this.defaultPort,
    };
  }

  generateSystemdService(_config?: ServiceConfig): string {
    return `[Unit]
Description=Caddy Web Server
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
`;
  }

  getPostInstallCommands(_config?: ServiceConfig): string[] {
    return ["systemctl daemon-reload", "systemctl enable caddy", "systemctl start caddy"];
  }

  getConnectionEnv(_server: ServerConfig, config?: ServiceConfig): Record<string, string> {
    return {
      CADDY_HOST: "localhost",
      CADDY_PORT: String(config?.port ?? this.defaultPort),
    };
  }

  generateInstallScript(config?: ServiceConfig): string {
    const port = config?.port ?? this.defaultPort;

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

  generateRemoveScript(_config?: ServiceConfig): string {
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
  }
}
