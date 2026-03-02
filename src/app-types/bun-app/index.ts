/**
 * Bun.js App Type Handler
 */
import type { AppConfig, AppTypeHandler } from "../../types/index.js";

export class BunAppHandler implements AppTypeHandler {
  readonly name = "bun-app";
  readonly description = "Bun.js application with HTTP server";
  readonly requiredServices = ["bun", "caddy"];

  async validate(config: AppConfig): Promise<boolean> {
    // Basic validation - ensure port is specified
    if (!config.port || config.port < 1 || config.port > 65535) {
      console.error("Error: Invalid port number. Must be between 1 and 65535.");
      return false;
    }

    // Validate git repository URL format
    const gitUrlPattern = /^(https?:\/\/|git@).*\.(git|)$|^(https?:\/\/).*[^/]$/;
    if (!gitUrlPattern.test(config.gitRepo)) {
      console.warn("Warning: Git repository URL format looks unusual.");
    }

    return true;
  }

  generateDeployScript(config: AppConfig): string {
    const appDir = `/var/www/${config.name}`;

    return `#!/bin/bash
set -e

echo "Deploying ${config.name}..."

# Navigate to app directory
cd ${appDir}

# Install dependencies
echo "Installing dependencies..."
bun install --frozen-lockfile || bun install

# Build if build script exists
if [ -f package.json ] && grep -q '"build"' package.json; then
  echo "Building application..."
  bun run build
fi

# Restart the service (handled outside this script)
echo "Deployment script complete."
`;
  }

  generateWebConfig(config: AppConfig): string {
    const domain = config.domain || ":80";
    const appDir = `/var/www/${config.name}`;

    return `${domain} {
    reverse_proxy localhost:${config.port}

    # Static files (if public directory exists)
    handle_path /static/* {
        root * ${appDir}/public
        file_server
        header Cache-Control "public, max-age=31536000, immutable"
    }

    # Health check endpoint
    respond /health "healthy\n" 200

    # Security headers
    header {
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
    }

    # Logging
    log {
        output file /var/log/caddy/${config.name}.access.log
    }
}
`;
  }

  generateSystemdService(config: AppConfig): string {
    const appDir = `/var/www/${config.name}`;

    return `[Unit]
Description=Bun Deploy App: ${config.name}
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=${appDir}
Environment=NODE_ENV=production
Environment=PORT=${config.port}
ExecStart=/usr/local/bin/bun run start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bun-deploy-${config.name}

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${appDir}

[Install]
WantedBy=multi-user.target
`;
  }

  getSetupCommands(config: AppConfig): string[] {
    const appDir = `/var/www/${config.name}`;

    return [
      // Ensure proper ownership
      `sudo chown -R deploy:deploy ${appDir}`,

      // Create logs directory
      `sudo mkdir -p /var/log/bun-deploy/${config.name}`,
      `sudo chown deploy:deploy /var/log/bun-deploy/${config.name}`,
    ];
  }

  getHealthCheck(_config: AppConfig): { path: string; expectedStatus: number } {
    return {
      path: "/health",
      expectedStatus: 200,
    };
  }
}
