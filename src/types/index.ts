/**
 * Bun Deploy CLI - Shared TypeScript Interfaces
 */

export type ServerState = "unprovisioned" | "provisioning" | "ready" | "error";

export interface ServerConfig {
  name: string;
  host: string;
  port: number;
  username: string;
  sshKeyPath?: string;
  sshKeyPassphrase?: string;
  state: ServerState;
  provisionedAt?: string;
  installedApps: string[];
}

export interface AppConfig {
  name: string;
  serverName: string;
  appType: string;
  gitRepo: string;
  gitBranch: string;
  domain?: string;
  envVars: Record<string, string>;
  deployScript?: string;
  port: number;
  lastDeployedAt?: string;
  lastCommit?: string;
}

export interface GlobalConfig {
  defaultSshKeyPath?: string;
  [key: string]: string | undefined;
}

export interface AppTypeHandler {
  readonly name: string;
  readonly description: string;

  /** Validate app configuration before deployment */
  validate(config: AppConfig): Promise<boolean>;

  /** Generate server-side deployment script */
  generateDeployScript(config: AppConfig): string;

  /** Generate Nginx configuration for this app */
  generateNginxConfig(config: AppConfig): string;

  /** Generate systemd service file */
  generateSystemdService(config: AppConfig): string;

  /** Environment setup commands (run once per app) */
  getSetupCommands(config: AppConfig): string[];

  /** Health check endpoint/path */
  getHealthCheck(config: AppConfig): { path: string; expectedStatus: number };
}

export interface SSHExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface DeployResult {
  success: boolean;
  message: string;
  commit?: string;
  error?: Error;
}
