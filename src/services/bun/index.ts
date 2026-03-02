/**
 * Bun Service Handler - Fast JavaScript runtime
 */
import type {
  ServerConfig,
  ServiceConfig,
  ServiceHandler,
  ServiceInstallResult,
  ServiceStatus,
} from "../../types/index.js";

export class BunHandler implements ServiceHandler {
  readonly name = "bun";
  readonly description = "Bun - Fast JavaScript runtime, bundler, and package manager";
  readonly category = "other" as const;
  readonly defaultPort = 0; // Bun itself doesn't have a default port

  async isInstalled(server: ServerConfig): Promise<boolean> {
    return server.installedServices.includes(this.name);
  }

  async isRunning(_server: ServerConfig): Promise<boolean> {
    // Bun is not a service, it's a runtime - always "running" if installed
    return true;
  }

  async install(_server: ServerConfig, _config?: ServiceConfig): Promise<ServiceInstallResult> {
    return {
      success: true,
      message: "Bun installed",
    };
  }

  async remove(_server: ServerConfig): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: "Bun removed successfully",
    };
  }

  async getStatus(_server: ServerConfig): Promise<ServiceStatus> {
    return {
      installed: true,
      running: true,
      version: "1.x",
    };
  }

  generateSystemdService(_config?: ServiceConfig): string {
    // Bun doesn't need a systemd service - it's used by app systemd services
    return "# Bun is a runtime, not a service. Each app has its own systemd service.";
  }

  getPostInstallCommands(_config?: ServiceConfig): string[] {
    return [];
  }

  getConnectionEnv(_server: ServerConfig, _config?: ServiceConfig): Record<string, string> {
    return {
      BUN_INSTALL: "/usr/local",
      PATH: "/usr/local/bin:$PATH",
    };
  }
}
