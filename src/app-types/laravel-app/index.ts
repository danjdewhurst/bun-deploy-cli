/**
 * Laravel 12 App Type Handler with PHP 8.4
 *
 * Features:
 * - PHP 8.4 FPM with optimised configuration
 * - Queue workers (horizon or default queue)
 * - Task scheduler (cron)
 * - Redis support
 * - MariaDB/MySQL support
 * - Node.js/Bun asset building
 * - Laravel Optimisations (cache, route, view, config)
 */
import type { AppConfig, AppTypeHandler } from "../../types/index.js";

/** Laravel-specific environment variables (all optional) */
export type LaravelEnvVars = {
  APP_NAME?: string;
  APP_ENV?: string;
  APP_KEY?: string;
  APP_DEBUG?: string;
  APP_URL?: string;
  DB_CONNECTION?: string;
  DB_HOST?: string;
  DB_PORT?: string;
  DB_DATABASE?: string;
  DB_USERNAME?: string;
  DB_PASSWORD?: string;
  REDIS_HOST?: string;
  REDIS_PORT?: string;
  REDIS_PASSWORD?: string;
  QUEUE_CONNECTION?: string;
  CACHE_STORE?: string;
  SESSION_DRIVER?: string;
  QUEUE_NAME?: string;
  USE_HORIZON?: string;
  USE_SCHEDULER?: string;
  INSTALL_MARIADB?: string;
  INSTALL_REDIS?: string;
  INSTALL_NODE?: string;
  [key: string]: string | undefined;
};

export class LaravelAppHandler implements AppTypeHandler {
  readonly name = "laravel-app";
  readonly description = "Laravel 12 application with PHP 8.4, queues, scheduler, and Redis";

  async validate(config: AppConfig): Promise<boolean> {
    const env = config.envVars as LaravelEnvVars;

    // Validate PHP-FPM port/socket configuration
    if (config.port && (config.port < 1 || config.port > 65535)) {
      console.error("Error: Invalid port number. Must be between 1 and 65535.");
      return false;
    }

    // Validate APP_KEY is set or will be set
    if (!env.APP_KEY) {
      console.warn("Warning: APP_KEY not set. Laravel will generate one on first deploy.");
    }

    // Validate database configuration
    if (env.DB_CONNECTION === "mysql" && !env.DB_DATABASE) {
      console.warn("Warning: DB_DATABASE not set. Using default 'laravel'.");
    }

    return true;
  }

  generateDeployScript(config: AppConfig): string {
    const appDir = `/var/www/${config.name}`;
    const useQueueWorker = config.envVars.QUEUE_CONNECTION !== "sync";
    const useScheduler = config.envVars.USE_SCHEDULER === "true";
    const useHorizon = config.envVars.QUEUE_CONNECTION === "redis" && config.envVars.USE_HORIZON === "true";

    return `#!/bin/bash
set -e

echo "Deploying Laravel application: ${config.name}"
cd ${appDir}

# Ensure proper permissions
sudo chown -R deploy:deploy ${appDir}
sudo chmod -R 755 ${appDir}

# Install PHP dependencies
echo "Installing Composer dependencies..."
if [ -f composer.lock ]; then
  composer install --no-dev --optimize-autoloader --no-interaction
else
  composer install --no-dev --optimize-autoloader --no-interaction
fi

# Install and build frontend assets
echo "Building frontend assets..."
if [ -f package.json ]; then
  if command -v bun &> /dev/null && [ -f bun.lockb ] || [ -f bun.lock ]; then
    echo "Using Bun for assets..."
    bun install
    if grep -q "build" package.json; then
      bun run build
    fi
  else
    echo "Using npm for assets..."
    npm ci
    if grep -q "build" package.json; then
      npm run build
    fi
  fi
fi

# Laravel optimisation commands
echo "Running Laravel optimisations..."

# Generate APP_KEY if not set
if [ -z "$APP_KEY" ] && [ -f .env ]; then
  php artisan key:generate --quiet || true
fi

# Clear existing caches
php artisan cache:clear --quiet || true
php artisan config:clear --quiet || true
php artisan route:clear --quiet || true
php artisan view:clear --quiet || true

# Run database migrations
echo "Running database migrations..."
php artisan migrate --force --no-interaction || echo "Migration warning: check database connection"

# Cache configuration, routes, and views for production
echo "Caching configuration..."
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

# Storage link
echo "Creating storage link..."
php artisan storage:link --quiet || true

# Cache bootstrap files
php artisan optimize

# Restart PHP-FPM to clear opcache
echo "Restarting PHP-FPM..."
sudo systemctl restart php8.4-fpm

${useQueueWorker ? `
# Restart queue workers
echo "Restarting queue workers..."
if systemctl is-active --quiet ${config.name}-horizon; then
  sudo systemctl restart ${config.name}-horizon
elif systemctl is-active --quiet ${config.name}-queue; then
  sudo systemctl restart ${config.name}-queue
fi
` : ""}

${useScheduler ? `
# Ensure scheduler is running
echo "Ensuring scheduler is active..."
sudo systemctl is-active --quiet ${config.name}-scheduler || sudo systemctl start ${config.name}-scheduler
` : ""}

echo "Deployment complete!"
`;
  }

  generateNginxConfig(config: AppConfig): string {
    const serverName = config.domain || "_";
    const phpVersion = "8.4";

    return `server {
    listen ${config.port || 80};
    listen [::]:${config.port || 80};
    server_name ${serverName};
    root /var/www/${config.name}/public;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Index files
    index index.php index.html;

    # Charset
    charset utf-8;

    # Logging
    access_log /var/log/nginx/${config.name}-access.log;
    error_log /var/log/nginx/${config.name}-error.log;

    # Laravel location block
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    # PHP-FPM configuration
    location ~ \\.php$ {
        fastcgi_pass unix:/var/run/php/php${phpVersion}-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;

        # Performance tuning
        fastcgi_buffer_size 128k;
        fastcgi_buffers 4 256k;
        fastcgi_busy_buffers_size 256k;
        fastcgi_connect_timeout 60s;
        fastcgi_send_timeout 60s;
        fastcgi_read_timeout 60s;
    }

    # Deny access to hidden files
    location ~ /\\.(?!well-known).* {
        deny all;
    }

    # Deny access to sensitive Laravel files
    location ~ ^/(?:\\.env|composer\\.(json|lock)|package\\.json|webpack\\.mix\\.js) {
        deny all;
    }

    # Static file caching
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Health check endpoint (bypasses Laravel for lightweight check)
    location /health/nginx {
        access_log off;
        return 200 "nginx healthy\\n";
        add_header Content-Type text/plain;
    }
}
`;
  }

  generateSystemdService(config: AppConfig): string {
    const appDir = `/var/www/${config.name}`;
    const useQueueWorker = config.envVars.QUEUE_CONNECTION !== "sync";
    const useScheduler = config.envVars.USE_SCHEDULER === "true";
    const useHorizon = config.envVars.QUEUE_CONNECTION === "redis" && config.envVars.USE_HORIZON === "true";

    // Main PHP-FPM service is managed by system, but we create queue workers
    let services = "";

    if (useHorizon) {
      // Laravel Horizon (Redis + nice dashboard)
      services += `[Unit]
Description=Laravel Horizon for ${config.name}
After=network.target redis.service mysql.service
Wants=redis.service mysql.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=${appDir}
ExecStart=/usr/bin/php ${appDir}/artisan horizon
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${config.name}-horizon

# Stop signal for graceful shutdown
KillSignal=SIGTERM

# Resource limits
MemoryLimit=512M
TasksMax=50

[Install]
WantedBy=multi-user.target

---
`;
    } else if (useQueueWorker) {
      // Standard queue worker
      const queueName = config.envVars.QUEUE_NAME || "default";
      services += `[Unit]
Description=Laravel Queue Worker for ${config.name}
After=network.target redis.service mysql.service
Wants=redis.service mysql.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=${appDir}
ExecStart=/usr/bin/php ${appDir}/artisan queue:work --queue=${queueName} --sleep=3 --tries=3 --timeout=90 --max-jobs=1000 --max-time=3600
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${config.name}-queue

# Stop signal for graceful shutdown
KillSignal=SIGTERM

# Resource limits
MemoryLimit=256M
TasksMax=20

[Install]
WantedBy=multi-user.target

---
`;
    }

    if (useScheduler) {
      // Task scheduler (replaces cron)
      services += `[Unit]
Description=Laravel Scheduler for ${config.name}
After=network.target mysql.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=${appDir}
ExecStart=/usr/bin/php ${appDir}/artisan schedule:work
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${config.name}-scheduler

[Install]
WantedBy=multi-user.target
`;
    }

    return services || "# No additional systemd services required (using basic php-fpm)";
  }

  getSetupCommands(config: AppConfig): string[] {
    const appDir = `/var/www/${config.name}`;
    const installMariaDB = config.envVars.INSTALL_MARIADB === "true";
    const installRedis = config.envVars.INSTALL_REDIS === "true" || config.envVars.CACHE_STORE === "redis" || config.envVars.QUEUE_CONNECTION === "redis";
    const installNode = config.envVars.INSTALL_NODE !== "false"; // Default true

    const commands: string[] = [
      // Install PHP 8.4 and required extensions
      "sudo add-apt-repository -y ppa:ondrej/php 2>/dev/null || true",
      "sudo apt-get update -qq",
      "sudo apt-get install -y -qq php8.4-fpm php8.4-cli php8.4-common",
      "sudo apt-get install -y -qq php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip",
      "sudo apt-get install -y -qq php8.4-mysql php8.4-sqlite3",
      "sudo apt-get install -y -qq php8.4-redis php8.4-bcmath php8.4-gd php8.4-intl",
      "sudo apt-get install -y -qq php8.4-opcache php8.4-readline",
    ];

    // Install Composer if not present
    commands.push(
      'if ! command -v composer &> /dev/null; then curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer; fi',
    );

    // Install Node.js and npm if requested
    if (installNode) {
      commands.push(
        'if ! command -v node &> /dev/null; then curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y -qq nodejs; fi',
      );
    }

    // Install MariaDB if requested
    if (installMariaDB) {
      commands.push(
        "sudo apt-get install -y -qq mariadb-server",
        "sudo systemctl enable mariadb",
        "sudo systemctl start mariadb",
        // Secure installation with default settings
        "sudo mysql -e \"UPDATE mysql.global_priv SET priv=json_set(priv, '$.plugin', 'mysql_native_password', '$.authentication_string', PASSWORD('root')) WHERE User='root';\" 2>/dev/null || true",
        "sudo mysql -e \"DELETE FROM mysql.global_priv WHERE User='';\" 2>/dev/null || true",
        "sudo mysql -e \"DELETE FROM mysql.global_priv WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');\" 2>/dev/null || true",
        "sudo mysql -e \"DROP DATABASE IF EXISTS test;\" 2>/dev/null || true",
      );

      // Create database if specified
      const dbName = config.envVars.DB_DATABASE || config.name.replace(/[^a-zA-Z0-9_]/g, "_");
      const dbUser = config.envVars.DB_USERNAME || config.name.replace(/[^a-zA-Z0-9_]/g, "_");
      const dbPass = config.envVars.DB_PASSWORD || this.generateRandomPassword();

      commands.push(
        `sudo mysql -e "CREATE DATABASE IF NOT EXISTS ${dbName};"`,
        `sudo mysql -e "CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}';"`,
        `sudo mysql -e "GRANT ALL PRIVILEGES ON ${dbName}.* TO '${dbUser}'@'localhost';"`,
        `sudo mysql -e "FLUSH PRIVILEGES;"`,
        `echo "Database credentials - Name: ${dbName}, User: ${dbUser}, Pass: ${dbPass}"`,
      );
    }

    // Install Redis if requested
    if (installRedis) {
      commands.push(
        "sudo apt-get install -y -qq redis-server",
        "sudo systemctl enable redis-server",
        "sudo systemctl start redis-server",
      );
    }

    // Configure PHP-FPM for deploy user
    commands.push(
      "sudo mkdir -p /run/php",
      `sudo mkdir -p ${appDir}`,
      `sudo chown -R deploy:deploy ${appDir}`,
      `sudo chmod -R 755 ${appDir}`,
      // Enable and start PHP-FPM
      "sudo systemctl enable php8.4-fpm",
      "sudo systemctl start php8.4-fpm",
    );

    // Create log directories
    commands.push(
      `sudo mkdir -p /var/log/bun-deploy/${config.name}`,
      `sudo chown deploy:deploy /var/log/bun-deploy/${config.name}`,
    );

    return commands;
  }

  getHealthCheck(_config: AppConfig): { path: string; expectedStatus: number } {
    // Laravel 11+ includes a /up health check endpoint
    return {
      path: "/up",
      expectedStatus: 200,
    };
  }

  private generateRandomPassword(length = 16): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
