/**
 * MinIO Service Handler - S3-compatible object storage
 */
import type {
  ServerConfig,
  ServiceConfig,
  ServiceHandler,
  ServiceInstallResult,
  ServiceStatus,
} from "../../types/index.js";

export class MinioHandler implements ServiceHandler {
  readonly name = "minio";
  readonly description = "MinIO - S3-compatible object storage";
  readonly category = "storage" as const;
  readonly defaultPort = 9000;

  async isInstalled(server: ServerConfig): Promise<boolean> {
    return server.installedServices.includes(this.name);
  }

  async isRunning(_server: ServerConfig): Promise<boolean> {
    return true;
  }

  async install(_server: ServerConfig, config?: ServiceConfig): Promise<ServiceInstallResult> {
    const port = config?.port ?? this.defaultPort;
    const consolePort = 9001; // MinIO web console
    const rootUser = (config?.options?.rootUser as string) ?? "minioadmin";
    const rootPassword = this.generatePassword();

    return {
      success: true,
      message: `MinIO installed on port ${port} (console: ${consolePort})`,
      port,
      credentials: {
        username: rootUser,
        password: rootPassword,
      },
    };
  }

  async remove(_server: ServerConfig): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: "MinIO removed successfully",
    };
  }

  async getStatus(_server: ServerConfig): Promise<ServiceStatus> {
    return {
      installed: true,
      running: true,
      version: "latest",
      port: this.defaultPort,
    };
  }

  generateSystemdService(config?: ServiceConfig): string {
    const port = config?.port ?? this.defaultPort;
    const consolePort = 9001;

    return `[Unit]
Description=MinIO Object Storage
Documentation=https://min.io/docs/minio/linux/index.html
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=minio-user
Group=minio-user
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server /var/lib/minio/data --address :${port} --console-address :${consolePort}
Restart=always
RestartSec=5

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/minio

[Install]
WantedBy=multi-user.target
`;
  }

  getPostInstallCommands(_config?: ServiceConfig): string[] {
    return ["systemctl daemon-reload", "systemctl enable minio", "systemctl start minio"];
  }

  getConnectionEnv(_server: ServerConfig, config?: ServiceConfig): Record<string, string> {
    const port = config?.port ?? this.defaultPort;
    const rootUser = (config?.options?.rootUser as string) ?? "minioadmin";
    const consolePort = 9001;

    return {
      MINIO_ENDPOINT: `localhost:${port}`,
      MINIO_PORT: String(port),
      MINIO_CONSOLE_PORT: String(consolePort),
      MINIO_ROOT_USER: rootUser,
      S3_ENDPOINT: `http://localhost:${port}`,
      AWS_ENDPOINT_URL_S3: `http://localhost:${port}`,
    };
  }

  private generatePassword(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 32; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
