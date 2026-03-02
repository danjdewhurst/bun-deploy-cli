/**
 * Meilisearch Service Handler - Fast, typo-tolerant search engine
 */
import type {
  ServerConfig,
  ServiceConfig,
  ServiceHandler,
  ServiceInstallResult,
  ServiceStatus,
} from "../../types/index.js";

export class MeilisearchHandler implements ServiceHandler {
  readonly name = "meilisearch";
  readonly description = "Meilisearch - Typo-tolerant search engine";
  readonly category = "search" as const;
  readonly defaultPort = 7700;

  async isInstalled(server: ServerConfig): Promise<boolean> {
    return server.installedServices.includes(this.name);
  }

  async isRunning(_server: ServerConfig): Promise<boolean> {
    return true;
  }

  async install(_server: ServerConfig, config?: ServiceConfig): Promise<ServiceInstallResult> {
    const port = config?.port ?? this.defaultPort;
    const apiKey = this.generateApiKey();

    return {
      success: true,
      message: `Meilisearch installed on port ${port}`,
      port,
      credentials: {
        apiKey,
      },
    };
  }

  async remove(_server: ServerConfig): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: "Meilisearch removed successfully",
    };
  }

  async getStatus(_server: ServerConfig): Promise<ServiceStatus> {
    return {
      installed: true,
      running: true,
      version: "1.x",
      port: this.defaultPort,
    };
  }

  generateSystemdService(config?: ServiceConfig): string {
    const port = config?.port ?? this.defaultPort;

    return `[Unit]
Description=Meilisearch search engine
After=network.target

[Service]
Type=simple
User=meilisearch
Group=meilisearch
WorkingDirectory=/var/lib/meilisearch
EnvironmentFile=/etc/meilisearch.env
ExecStart=/usr/local/bin/meilisearch --http-addr 127.0.0.1:${port}
Restart=on-failure
RestartSec=5

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/meilisearch /var/log/meilisearch

[Install]
WantedBy=multi-user.target
`;
  }

  getPostInstallCommands(_config?: ServiceConfig): string[] {
    return [
      "systemctl daemon-reload",
      "systemctl enable meilisearch",
      "systemctl start meilisearch",
    ];
  }

  getConnectionEnv(_server: ServerConfig, config?: ServiceConfig): Record<string, string> {
    const port = config?.port ?? this.defaultPort;

    return {
      MEILISEARCH_HOST: `http://localhost:${port}`,
      MEILISEARCH_PORT: String(port),
    };
  }

  generateInstallScript(config?: ServiceConfig): string {
    const port = config?.port ?? this.defaultPort;
    const apiKey = this.generateApiKey();

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

  generateRemoveScript(_config?: ServiceConfig): string {
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
  }

  private generateApiKey(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let key = "";
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }
}
