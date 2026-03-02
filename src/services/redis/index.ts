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

  generateInstallScript(config?: ServiceConfig): string {
    const port = config?.port ?? this.defaultPort;

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

  generateRemoveScript(_config?: ServiceConfig): string {
    return `#!/bin/bash
set -e
systemctl stop redis-server || true
systemctl disable redis-server || true
apt-get remove -y redis-server || true
apt-get autoremove -y || true
rm -rf /etc/redis /var/log/redis /var/lib/redis
userdel redis 2>/dev/null || true
`;
  }
}
