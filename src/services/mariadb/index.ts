/**
 * MariaDB Service Handler - SQL database server
 */
import type {
  ServerConfig,
  ServiceConfig,
  ServiceHandler,
  ServiceInstallResult,
  ServiceStatus,
} from "../../types/index.js";

export class MariaDBHandler implements ServiceHandler {
  readonly name = "mariadb";
  readonly description = "MariaDB - Open source relational database";
  readonly category = "database" as const;
  readonly defaultPort = 3306;

  async isInstalled(server: ServerConfig): Promise<boolean> {
    return server.installedServices.includes(this.name);
  }

  async isRunning(_server: ServerConfig): Promise<boolean> {
    return true;
  }

  async install(_server: ServerConfig, config?: ServiceConfig): Promise<ServiceInstallResult> {
    const port = config?.port ?? this.defaultPort;
    const rootPassword = this.generatePassword();

    return {
      success: true,
      message: `MariaDB installed on port ${port}`,
      port,
      credentials: {
        username: "root",
        password: rootPassword,
      },
    };
  }

  async remove(_server: ServerConfig): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: "MariaDB removed successfully",
    };
  }

  async getStatus(_server: ServerConfig): Promise<ServiceStatus> {
    return {
      installed: true,
      running: true,
      version: "10.11",
      port: this.defaultPort,
    };
  }

  generateSystemdService(config?: ServiceConfig): string {
    const port = config?.port ?? this.defaultPort;

    return `[Unit]
Description=MariaDB database server
After=network.target

[Service]
Type=notify
ExecStart=/usr/sbin/mysqld --port=${port}
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
User=mysql
Group=mysql

[Install]
WantedBy=multi-user.target
`;
  }

  getPostInstallCommands(_config?: ServiceConfig): string[] {
    return ["systemctl enable mariadb", "systemctl start mariadb"];
  }

  getConnectionEnv(_server: ServerConfig, config?: ServiceConfig): Record<string, string> {
    const port = config?.port ?? this.defaultPort;

    return {
      DB_HOST: "localhost",
      DB_PORT: String(port),
      DB_CONNECTION: "mysql",
    };
  }

  generateInstallScript(config?: ServiceConfig): string {
    const port = config?.port ?? this.defaultPort;
    const rootPassword = this.generatePassword();

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
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\\\_%';
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

  generateRemoveScript(_config?: ServiceConfig): string {
    return `#!/bin/bash
set -e
systemctl stop mariadb || true
systemctl disable mariadb || true
apt-get remove -y mariadb-server mariadb-client || true
apt-get autoremove -y || true
rm -rf /etc/mysql /var/lib/mysql /var/log/mysql
userdel mysql 2>/dev/null || true
`;
  }

  private generatePassword(): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 24; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
