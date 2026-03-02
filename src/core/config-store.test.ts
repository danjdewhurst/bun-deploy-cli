/**
 * Tests for config-store with SQLite storage
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AppConfig, ServerConfig } from "../types/index.js";
import {
  appExists,
  getApp,
  getConfigValue,
  getGlobalConfig,
  getServer,
  listApps,
  listAppsByServer,
  listServers,
  removeApp,
  removeServer,
  resetDatabase,
  saveApp,
  saveServer,
  serverExists,
  setConfigValue,
  setGlobalConfig,
} from "./config-store.js";
import { initializeSchema } from "./database.js";

let testDbCounter = 0;

describe("config-store", () => {
  beforeEach(() => {
    // Use unique in-memory database for test isolation
    // Each :memory: URL with a unique identifier is a separate database
    resetDatabase(`:memory:test${testDbCounter++}`);
    initializeSchema();
  });

  afterEach(() => {
    resetDatabase();
  });

  describe("global config", () => {
    test("set and get config value", async () => {
      await setConfigValue("hetzner.token", "my-secret-token");
      const value = await getConfigValue("hetzner.token");
      expect(value).toBe("my-secret-token");
    });

    test("get undefined config value returns undefined", async () => {
      const value = await getConfigValue("nonexistent.key");
      expect(value).toBeUndefined();
    });

    test("set and get global config object", async () => {
      await setGlobalConfig({
        "hetzner.token": "token123",
        "hetzner.context": "my-project",
        "aws.region": "us-east-1",
      });

      const config = await getGlobalConfig();
      expect(config["hetzner.token"]).toBe("token123");
      expect(config["hetzner.context"]).toBe("my-project");
      expect(config["aws.region"]).toBe("us-east-1");
    });

    test("update existing config value", async () => {
      await setConfigValue("hetzner.token", "old-token");
      await setConfigValue("hetzner.token", "new-token");
      const value = await getConfigValue("hetzner.token");
      expect(value).toBe("new-token");
    });
  });

  describe("server config", () => {
    const createTestServer = (suffix: string): ServerConfig => ({
      name: `test-server-${suffix}`,
      host: "192.168.1.1",
      port: 22,
      username: "root",
      sshKeyPath: "/path/to/key",
      state: "ready",
      provisionedAt: "2025-03-02T12:00:00Z",
      installedApps: ["nginx", "node"],
    });

    test("save and get server", async () => {
      const server = createTestServer("get");
      await saveServer(server);
      const retrieved = await getServer(server.name);
      expect(retrieved).toEqual(server);
    });

    test("get nonexistent server returns null", async () => {
      const server = await getServer("does-not-exist");
      expect(server).toBeNull();
    });

    test("list servers", async () => {
      await saveServer(createTestServer("list1"));
      await saveServer(createTestServer("list2"));

      const servers = await listServers();
      expect(servers).toHaveLength(2);
    });

    test("update existing server", async () => {
      const server = createTestServer("update");
      await saveServer(server);
      await saveServer({
        ...server,
        host: "192.168.1.100",
      });

      const retrieved = await getServer(server.name);
      expect(retrieved?.host).toBe("192.168.1.100");
    });

    test("server exists", async () => {
      const server = createTestServer("exists");
      await saveServer(server);
      expect(await serverExists(server.name)).toBe(true);
    });

    test("remove server", async () => {
      const server = createTestServer("remove");
      await saveServer(server);
      expect(await serverExists(server.name)).toBe(true);

      const result = await removeServer(server.name);
      expect(result).toBe(true);
    });

    test("remove nonexistent server returns false", async () => {
      const result = await removeServer("does-not-exist");
      expect(result).toBe(false);
    });

    test("server with optional fields undefined", async () => {
      const minimalServer: ServerConfig = {
        name: "minimal-server",
        host: "192.168.1.3",
        port: 22,
        username: "root",
        state: "unprovisioned",
        installedApps: [],
      };

      await saveServer(minimalServer);
      const retrieved = await getServer("minimal-server");
      expect(retrieved).toEqual(minimalServer);
    });
  });

  describe("app config", () => {
    const createTestServer = (suffix: string): ServerConfig => ({
      name: `app-test-server-${suffix}`,
      host: "192.168.1.1",
      port: 22,
      username: "root",
      state: "ready",
      installedApps: [],
    });

    const createTestApp = (suffix: string, serverName: string): AppConfig => ({
      name: `test-app-${suffix}`,
      serverName,
      appType: "bun-app",
      gitRepo: "https://github.com/user/repo",
      gitBranch: "main",
      domain: "example.com",
      envVars: { NODE_ENV: "production", PORT: "3000" },
      deployScript: "./deploy.sh",
      port: 3000,
      lastDeployedAt: "2025-03-02T12:00:00Z",
      lastCommit: "abc123",
    });

    test("save and get app", async () => {
      const server = createTestServer("get");
      await saveServer(server);
      const app = createTestApp("get", server.name);
      await saveApp(app);
      const retrieved = await getApp(app.name);
      expect(retrieved).toEqual(app);
    });

    test("get nonexistent app returns null", async () => {
      const app = await getApp("does-not-exist");
      expect(app).toBeNull();
    });

    test("list apps", async () => {
      const server = createTestServer("list");
      await saveServer(server);
      await saveApp(createTestApp("list1", server.name));
      await saveApp(createTestApp("list2", server.name));

      const apps = await listApps();
      expect(apps).toHaveLength(2);
    });

    test("list apps by server", async () => {
      const server1 = createTestServer("byserver1");
      const server2 = createTestServer("byserver2");
      await saveServer(server1);
      await saveServer(server2);

      const app1 = createTestApp("byserver1", server1.name);
      const app2 = createTestApp("byserver2", server2.name);
      await saveApp(app1);
      await saveApp(app2);

      const apps = await listAppsByServer(server1.name);
      expect(apps).toHaveLength(1);
      expect(apps[0]!.name).toBe(app1.name);
    });

    test("app exists", async () => {
      const server = createTestServer("exists");
      const app = createTestApp("exists", server.name);
      await saveServer(server);
      await saveApp(app);
      expect(await appExists(app.name)).toBe(true);
    });

    test("remove app", async () => {
      const server = createTestServer("remove");
      const app = createTestApp("remove", server.name);
      await saveServer(server);
      await saveApp(app);
      expect(await appExists(app.name)).toBe(true);

      const result = await removeApp(app.name);
      expect(result).toBe(true);
    });

    test("remove nonexistent app returns false", async () => {
      const result = await removeApp("does-not-exist");
      expect(result).toBe(false);
    });

    test("app with optional fields undefined", async () => {
      const server = createTestServer("minimal");
      await saveServer(server);

      const minimalApp: AppConfig = {
        name: "minimal-app",
        serverName: server.name,
        appType: "bun-app",
        gitRepo: "https://github.com/user/repo",
        gitBranch: "main",
        envVars: {},
        port: 3000,
      };

      await saveApp(minimalApp);
      const retrieved = await getApp("minimal-app");
      expect(retrieved).toEqual(minimalApp);
    });

    test("cascade delete when server is removed", async () => {
      const server = createTestServer("cascade");
      const app = createTestApp("cascade", server.name);
      await saveServer(server);
      await saveApp(app);

      // Verify app exists before server deletion
      const appsBefore = await listAppsByServer(server.name);
      expect(appsBefore).toHaveLength(1);

      await removeServer(server.name);

      // App should be deleted due to ON DELETE CASCADE
      const appsAfter = await listAppsByServer(server.name);
      expect(appsAfter).toHaveLength(0);
    });

    test("update existing app", async () => {
      const server = createTestServer("update");
      const app = createTestApp("update", server.name);
      await saveServer(server);
      await saveApp(app);
      await saveApp({
        ...app,
        gitBranch: "develop",
        port: 4000,
      });

      const retrieved = await getApp(app.name);
      expect(retrieved?.gitBranch).toBe("develop");
      expect(retrieved?.port).toBe(4000);
    });
  });

  describe("JSON field handling", () => {
    test("handles empty installed apps array", async () => {
      const server: ServerConfig = {
        name: "no-apps-server",
        host: "192.168.1.1",
        port: 22,
        username: "root",
        state: "ready",
        installedApps: [],
      };

      await saveServer(server);
      const retrieved = await getServer("no-apps-server");
      expect(retrieved?.installedApps).toEqual([]);
    });

    test("handles empty env vars object", async () => {
      const server: ServerConfig = {
        name: "env-test-server",
        host: "192.168.1.1",
        port: 22,
        username: "root",
        state: "ready",
        installedApps: [],
      };
      await saveServer(server);

      const app: AppConfig = {
        name: "no-env-app",
        serverName: "env-test-server",
        appType: "bun-app",
        gitRepo: "https://github.com/user/repo",
        gitBranch: "main",
        envVars: {},
        port: 3000,
      };

      await saveApp(app);
      const retrieved = await getApp("no-env-app");
      expect(retrieved?.envVars).toEqual({});
    });

    test("handles complex env vars", async () => {
      const server: ServerConfig = {
        name: "complex-env-server",
        host: "192.168.1.1",
        port: 22,
        username: "root",
        state: "ready",
        installedApps: [],
      };
      await saveServer(server);

      const app: AppConfig = {
        name: "complex-env-app",
        serverName: "complex-env-server",
        appType: "bun-app",
        gitRepo: "https://github.com/user/repo",
        gitBranch: "main",
        envVars: {
          DATABASE_URL: "postgres://user:pass@localhost/db",
          API_KEY: "key-with-special-chars-!@#$%",
          MULTILINE: "line1\nline2\nline3",
        },
        port: 3000,
      };

      await saveApp(app);
      const retrieved = await getApp("complex-env-app");
      expect(retrieved?.envVars).toEqual(app.envVars);
    });
  });
});
