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

  /** Generate web server configuration (Caddy) for this app */
  generateWebConfig(config: AppConfig): string;

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

// ============================================================================
// Provider Types - Cloud server providers (CLI or API based)
// ============================================================================

export type ProviderType = "cli" | "api";

export type CloudServerStatus =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "creating"
  | "deleting"
  | "error"
  | "unknown";

export interface CloudServer {
  id: string;
  name: string;
  status: CloudServerStatus;
  ipv4?: string;
  ipv6?: string;
  type: string; // instance type (e.g., "cx22", "t3.micro")
  location: string; // region/datacenter
  image?: string; // OS image
  labels: Record<string, string>;
  createdAt?: string;
  provider: string; // provider name (e.g., "hetzner", "aws")
}

export interface CreateServerOptions {
  name: string;
  type?: string;
  location?: string;
  image?: string;
  sshKey?: string;
  labels?: Record<string, string>;
  userData?: string; // cloud-init script
}

export interface ProviderConfig {
  name: string;
  type: ProviderType;
  // CLI providers: command name to check (e.g., "hcloud")
  // API providers: not used
  cliCommand?: string;
  // API providers: base URL
  // CLI providers: not used
  apiEndpoint?: string;
  // Provider-specific settings stored in global config
  settings: Record<string, string>;
}

/**
 * Base interface for all cloud providers.
 * Implement this to add support for a new cloud provider.
 */
export interface CloudProvider {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly type: ProviderType;

  /**
   * Check if the provider is available (CLI installed or API accessible)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Check if the provider is configured (authenticated)
   */
  isConfigured(): Promise<boolean>;

  /**
   * Configure/authenticate the provider
   * @param credentials Provider-specific credentials
   */
  configure(credentials: Record<string, string>): Promise<void>;

  /**
   * Get provider status information
   */
  getStatus(): Promise<ProviderStatus>;

  /**
   * List all servers from this provider
   */
  listServers(): Promise<CloudServer[]>;

  /**
   * Create a new server
   */
  createServer(options: CreateServerOptions): Promise<CloudServer>;

  /**
   * Delete a server by ID or name
   */
  deleteServer(identifier: string): Promise<void>;

  /**
   * Get a single server by ID or name
   */
  getServer(identifier: string): Promise<CloudServer | null>;

  /**
   * Sync servers to local bun-deploy configuration
   * @param filter Optional filter function to select which servers to sync
   */
  syncServers(
    saveFn: (config: ServerConfig) => Promise<void>,
    filter?: (server: CloudServer) => boolean,
  ): Promise<number>;
}

export interface ProviderStatus {
  available: boolean;
  configured: boolean;
  version?: string;
  context?: string; // CLI context or API region
  serverCount?: number;
  message?: string;
}

/**
 * Provider factory function type
 */
export type ProviderFactory = () => CloudProvider;
