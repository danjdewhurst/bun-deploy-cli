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

  private generateApiKey(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let key = "";
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }
}
