/**
 * Hetzner Cloud Provider - CLI-based implementation
 */

import type {
  CloudProvider,
  CloudServer,
  CloudServerStatus,
  CreateServerOptions,
  ProviderStatus,
  ServerConfig,
} from "../../types/index.js";

interface HcloudServerResponse {
  id: number;
  name: string;
  status: string;
  public_net: {
    ipv4?: {
      ip: string;
    };
    ipv6?: {
      ip: string;
    };
  };
  server_type: {
    name: string;
    cores: number;
    memory: number;
  };
  datacenter: {
    name: string;
    location: {
      name: string;
    };
  };
  image?: {
    name: string;
  };
  labels: Record<string, string>;
  created: string;
}

class HetznerProvider implements CloudProvider {
  readonly name = "hetzner";
  readonly displayName = "Hetzner Cloud";
  readonly description = "Hetzner Cloud servers via hcloud CLI";
  readonly type = "cli" as const;

  private async checkInstalled(): Promise<boolean> {
    try {
      const result = await Bun.$`which hcloud`.quiet();
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  private async execJson<T>(args: string[]): Promise<T | null> {
    try {
      const result = await Bun.$`hcloud ${args} --output json`.quiet();
      if (result.exitCode !== 0) return null;
      return JSON.parse(result.stdout.toString()) as T;
    } catch {
      return null;
    }
  }

  private async exec(
    args: string[],
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    try {
      const result = await Bun.$`hcloud ${args}`.quiet();
      return {
        success: result.exitCode === 0,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      };
    } catch (error) {
      return {
        success: false,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private mapStatus(status: string): CloudServerStatus {
    switch (status) {
      case "running":
        return "running";
      case "initializing":
      case "starting":
        return "starting";
      case "stopping":
        return "stopping";
      case "off":
        return "stopped";
      case "deleting":
        return "deleting";
      default:
        return "unknown";
    }
  }

  private mapServer(data: HcloudServerResponse): CloudServer {
    return {
      id: String(data.id),
      name: data.name,
      status: this.mapStatus(data.status),
      ipv4: data.public_net.ipv4?.ip,
      ipv6: data.public_net.ipv6?.ip,
      type: data.server_type.name,
      location: data.datacenter.location.name,
      image: data.image?.name,
      labels: data.labels,
      createdAt: data.created,
      provider: this.name,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.checkInstalled();
  }

  async isConfigured(): Promise<boolean> {
    if (!(await this.isAvailable())) return false;
    const result = await this.exec(["context", "active"]);
    return result.success && result.stdout.trim().length > 0;
  }

  async configure(credentials: Record<string, string>): Promise<void> {
    const token = credentials.token;
    if (!token) {
      throw new Error("Hetzner Cloud API token is required");
    }

    const env = { ...process.env, HCLOUD_TOKEN: token };
    const contextName = "bun-deploy";

    const result = await Bun.$`hcloud context create --token-from-env ${contextName}`
      .env(env)
      .quiet();

    if (result.exitCode !== 0) {
      // Context might already exist, try to use it
      const useResult = await this.exec(["context", "use", contextName]);
      if (!useResult.success) {
        throw new Error(`Failed to configure hcloud: ${useResult.stderr}`);
      }
    }

    // Test the token
    const testResult = await this.exec(["server", "list"]);
    if (!testResult.success) {
      throw new Error("Failed to authenticate with Hetzner Cloud");
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    const available = await this.isAvailable();
    if (!available) {
      return {
        available: false,
        configured: false,
        message: "hcloud CLI is not installed",
      };
    }

    const configured = await this.isConfigured();
    if (!configured) {
      return {
        available: true,
        configured: false,
        message:
          "hcloud CLI is not configured. Run: bun-deploy provider configure hetzner --token <token>",
      };
    }

    const versionResult = await this.exec(["version"]);
    const contextResult = await this.exec(["context", "active"]);
    const servers = await this.execJson<HcloudServerResponse[]>(["server", "list"]);

    return {
      available: true,
      configured: true,
      version: versionResult.stdout.trim(),
      context: contextResult.stdout.trim(),
      serverCount: servers?.length ?? 0,
    };
  }

  async listServers(): Promise<CloudServer[]> {
    const servers = await this.execJson<HcloudServerResponse[]>(["server", "list"]);
    if (!servers) return [];
    return servers.map((s) => this.mapServer(s));
  }

  async createServer(options: CreateServerOptions): Promise<CloudServer> {
    const args = ["server", "create", "--name", options.name];

    args.push("--type", options.type || "cx22");
    args.push("--location", options.location || "nbg1");
    args.push("--image", options.image || "ubuntu-24.04");

    if (options.sshKey) {
      args.push("--ssh-key", options.sshKey);
    }

    // Add labels
    if (options.labels) {
      for (const [key, value] of Object.entries(options.labels)) {
        args.push("--label", `${key}=${value}`);
      }
    }

    // Add managed-by label
    args.push("--label", "managed-by=bun-deploy");

    if (options.userData) {
      args.push("--user-data-from-file", options.userData);
    }

    const result = await this.exec(args);
    if (!result.success) {
      throw new Error(`Failed to create server: ${result.stderr}`);
    }

    // Fetch the created server details
    const servers = await this.listServers();
    const server = servers.find((s) => s.name === options.name);
    if (!server) {
      throw new Error("Server was created but could not be retrieved");
    }

    return server;
  }

  async deleteServer(identifier: string): Promise<void> {
    const result = await this.exec(["server", "delete", identifier]);
    if (!result.success) {
      throw new Error(`Failed to delete server: ${result.stderr}`);
    }
  }

  async getServer(identifier: string): Promise<CloudServer | null> {
    const servers = await this.listServers();
    return servers.find((s) => s.name === identifier || s.id === identifier) ?? null;
  }

  async syncServers(
    saveFn: (config: ServerConfig) => Promise<void>,
    filter?: (server: CloudServer) => boolean,
  ): Promise<number> {
    const servers = await this.listServers();

    const managedServers = filter ? servers.filter(filter) : servers;

    let syncedCount = 0;

    for (const server of managedServers) {
      if (!server.ipv4) continue;

      const serverConfig: ServerConfig = {
        name: server.name,
        host: server.ipv4,
        port: 22,
        username: "root",
        state: server.status === "running" ? "unprovisioned" : "error",
        installedApps: [],
        installedServices: [],
      };

      await saveFn(serverConfig);
      syncedCount++;
    }

    return syncedCount;
  }
}

/**
 * Factory function for creating Hetzner provider instances
 */
export function hetznerProvider(): CloudProvider {
  return new HetznerProvider();
}
