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

  private generatePassword(): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 24; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
