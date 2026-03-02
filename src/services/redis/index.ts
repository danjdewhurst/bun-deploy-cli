/**
 * Redis Service Handler - In-memory data store
 */
import type {
  ServerConfig,
  ServiceConfig,
  ServiceHandler,
  ServiceInstallResult,
  ServiceStatus,
} from "../../types/index.js";

export class RedisHandler implements ServiceHandler {
  readonly name = "redis";
  readonly description = "Redis - In-memory data structure store";
  readonly category = "cache" as const;
  readonly defaultPort = 6379;

  async isInstalled(server: ServerConfig): Promise<boolean> {
    // This will be checked via SSH - for now, simplified
    return server.installedServices.includes(this.name);
  }

  async isRunning(_server: ServerConfig): Promise<boolean> {
    // Would check via SSH: systemctl is-active redis
    return true;
  }

  async install(_server: ServerConfig, config?: ServiceConfig): Promise<ServiceInstallResult> {
    const port = config?.port ?? this.defaultPort;

    return {
      success: true,
      message: `Redis installed on port ${port}`,
      port,
    };
  }

  async remove(_server: ServerConfig): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: "Redis removed successfully",
    };
  }

  async getStatus(_server: ServerConfig): Promise<ServiceStatus> {
    return {
      installed: true,
      running: true,
      version: "7.x",
      port: this.defaultPort,
    };
  }

  generateSystemdService(config?: ServiceConfig): string {
    const port = config?.port ?? this.defaultPort;

    return `[Unit]
Description=Redis In-Memory Data Store
After=network.target

[Service]
Type=notify
ExecStart=/usr/bin/redis-server /etc/redis/redis.conf --port ${port}
ExecStop=/usr/bin/redis-cli -p ${port} shutdown
Restart=always
User=redis
Group=redis

[Install]
WantedBy=multi-user.target
`;
  }

  getPostInstallCommands(_config?: ServiceConfig): string[] {
    return ["systemctl enable redis-server", "systemctl start redis-server"];
  }

  getConnectionEnv(_server: ServerConfig, config?: ServiceConfig): Record<string, string> {
    const port = config?.port ?? this.defaultPort;

    return {
      REDIS_HOST: "localhost",
      REDIS_PORT: String(port),
      REDIS_URL: `redis://localhost:${port}`,
    };
  }
}
