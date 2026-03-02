/**
 * Bun.js App Type Handler
 */
import type { AppConfig, AppTypeHandler } from "../../types/index.js";

export class BunAppHandler implements AppTypeHandler {
  readonly name = "bun-app";
  readonly description = "Bun.js application with HTTP server";

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

  generateNginxConfig(config: AppConfig): string {
    const serverName = config.domain || "_";

    return `server {
    listen 80;
    server_name ${serverName};

    location / {
        proxy_pass http://127.0.0.1:${config.port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static files (if public directory exists)
    location /static {
        alias ${`/var/www/${config.name}/public`};
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
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

  getHealthCheck(config: AppConfig): { path: string; expectedStatus: number } {
    return {
      path: "/health",
      expectedStatus: 200,
    };
  }
}
