/**
 * Tests for Bun App Type Handler
 */
import { describe, expect, test } from "bun:test";
import type { AppConfig } from "../../types/index.js";
import { BunAppHandler } from "./index.js";

describe("BunAppHandler", () => {
  const handler = new BunAppHandler();

  const baseConfig: AppConfig = {
    name: "test-app",
    serverName: "test-server",
    appType: "bun-app",
    gitRepo: "https://github.com/user/repo.git",
    gitBranch: "main",
    domain: "example.com",
    envVars: {},
    port: 3000,
  };

  describe("validate", () => {
    test("returns true for valid config", async () => {
      const result = await handler.validate(baseConfig);
      expect(result).toBe(true);
    });

    test("returns false for invalid port (0)", async () => {
      const config = { ...baseConfig, port: 0 };
      const result = await handler.validate(config);
      expect(result).toBe(false);
    });

    test("returns false for invalid port (too high)", async () => {
      const config = { ...baseConfig, port: 70000 };
      const result = await handler.validate(config);
      expect(result).toBe(false);
    });
  });

  describe("generateDeployScript", () => {
    test("generates a bash script", () => {
      const script = handler.generateDeployScript(baseConfig);
      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("set -e");
    });

    test("includes app directory", () => {
      const script = handler.generateDeployScript(baseConfig);
      expect(script).toContain("/var/www/test-app");
    });

    test("runs bun install", () => {
      const script = handler.generateDeployScript(baseConfig);
      expect(script).toContain("bun install");
    });

    test("conditionally runs build", () => {
      const script = handler.generateDeployScript(baseConfig);
      expect(script).toContain("if [ -f package.json ]");
      expect(script).toContain("grep -q '\"build\"' package.json");
    });
  });

  describe("generateWebConfig", () => {
    test("generates Caddy config", () => {
      const config = handler.generateWebConfig(baseConfig);
      expect(config).toContain("example.com {");
      expect(config).toContain("reverse_proxy localhost:3000");
    });

    test("uses port 80 when no domain", () => {
      const appConfig = { ...baseConfig, domain: undefined };
      const config = handler.generateWebConfig(appConfig);
      expect(config).toContain(":80 {");
    });

    test("includes health check endpoint", () => {
      const config = handler.generateWebConfig(baseConfig);
      expect(config).toContain("respond /health");
    });

    test("includes security headers", () => {
      const config = handler.generateWebConfig(baseConfig);
      expect(config).toContain("X-Frame-Options");
      expect(config).toContain("X-Content-Type-Options");
    });

    test("includes static file handling", () => {
      const config = handler.generateWebConfig(baseConfig);
      expect(config).toContain("handle_path /static/*");
    });
  });

  describe("generateSystemdService", () => {
    test("generates systemd service file", () => {
      const service = handler.generateSystemdService(baseConfig);
      expect(service).toContain("[Unit]");
      expect(service).toContain("[Service]");
      expect(service).toContain("[Install]");
    });

    test("runs as deploy user", () => {
      const service = handler.generateSystemdService(baseConfig);
      expect(service).toContain("User=deploy");
    });

    test("includes correct working directory", () => {
      const service = handler.generateSystemdService(baseConfig);
      expect(service).toContain("WorkingDirectory=/var/www/test-app");
    });

    test("includes correct port", () => {
      const service = handler.generateSystemdService(baseConfig);
      expect(service).toContain("PORT=3000");
    });

    test("includes security hardening", () => {
      const service = handler.generateSystemdService(baseConfig);
      expect(service).toContain("NoNewPrivileges=true");
      expect(service).toContain("ProtectSystem=strict");
      expect(service).toContain("ProtectHome=true");
    });

    test("configures auto-restart", () => {
      const service = handler.generateSystemdService(baseConfig);
      expect(service).toContain("Restart=always");
      expect(service).toContain("RestartSec=5");
    });
  });

  describe("getSetupCommands", () => {
    test("returns array of commands", () => {
      const commands = handler.getSetupCommands(baseConfig);
      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBeGreaterThan(0);
    });

    test("includes chown command", () => {
      const commands = handler.getSetupCommands(baseConfig);
      expect(commands.some((cmd) => cmd.includes("chown"))).toBe(true);
    });

    test("creates log directory", () => {
      const commands = handler.getSetupCommands(baseConfig);
      expect(commands.some((cmd) => cmd.includes("mkdir"))).toBe(true);
    });
  });

  describe("getHealthCheck", () => {
    test("returns health check config", () => {
      const healthCheck = handler.getHealthCheck(baseConfig);
      expect(healthCheck.path).toBe("/health");
      expect(healthCheck.expectedStatus).toBe(200);
    });
  });
});
