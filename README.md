# Bun Deploy CLI

A CLI tool for managing Ubuntu 24.04 servers and deploying Bun.js applications via Git.

## Installation

```bash
# Clone or create the project directory
cd bun-deploy-cli

# Install dependencies
bun install

# Make the CLI available globally (optional)
bun link
```

## Quick Start

```bash
# Add a server
bun-deploy server add my-server --host 192.168.1.100 --user root --key ~/.ssh/id_rsa

# Provision the server (installs Bun, Nginx, security tools)
bun-deploy server setup my-server

# Create an app
bun-deploy app create my-app --server my-server --repo https://github.com/user/repo.git --domain example.com

# Set environment variables
bun-deploy app env my-app set DATABASE_URL postgres://localhost/mydb

# Deploy
bun-deploy app deploy my-app

# View logs
bun-deploy app logs my-app --follow
```

## Commands

### Server Management

```bash
# Add a new server
bun-deploy server add <name> --host <ip> [--port 22] [--user root] [--key <path>]

# List configured servers
bun-deploy server list

# Remove a server (local config only)
bun-deploy server remove <name> [--force]

# Provision a blank Ubuntu 24.04 server
bun-deploy server setup <name> [--force]

# Test SSH connection
bun-deploy server test <name>
```

### App Management

```bash
# Create a new app
bun-deploy app create <name> --server <name> --repo <git-url> [options]
  --type <type>       App type (default: bun-app)
  --branch <branch>   Git branch (default: main)
  --domain <domain>   Domain name
  --port <port>       Internal port

# List configured apps
bun-deploy app list

# Deploy an app
bun-deploy app deploy <name>

# Remove an app (local config only)
bun-deploy app remove <name> [--force]

# Manage environment variables
bun-deploy app env <name>              # List variables
bun-deploy app env <name> set KEY VALUE
bun-deploy app env <name> unset KEY

# View logs
bun-deploy app logs <name> [--follow]
```

### Configuration

```bash
# Get/set global config values
bun-deploy config get <key>
bun-deploy config set <key> <value>
```

## Configuration Storage

All configuration is stored locally in `~/.bun-deploy/`:

```
~/.bun-deploy/
  config.json              # Global settings
  servers/
    {server-name}.json     # Server connection details
  apps/
    {app-name}.json        # App deployment settings
```

## Server Provisioning

The `server setup` command performs the following on a fresh Ubuntu 24.04 server:

1. **System Updates** - `apt update && apt upgrade`
2. **Security Hardening**
   - UFW firewall (ports 22, 80, 443)
   - fail2ban for SSH protection
   - Automatic security updates
3. **Software Installation**
   - Bun.js runtime
   - Nginx web server
   - Git, curl, jq, htop
4. **User Setup**
   - Creates `deploy` user
   - Sets up `/var/www/` directory structure

## App Deployment Flow

When you run `bun-deploy app deploy <name>`:

1. SSH to target server
2. Git clone/pull the repository
3. Write environment variables to `.env`
4. Run `bun install` (and `bun run build` if applicable)
5. Configure systemd service
6. Configure Nginx reverse proxy
7. Run health check

## App Type: bun-app

The default `bun-app` type expects:

- A `package.json` with a `start` script
- An HTTP server listening on `process.env.PORT`
- (Optional) A `build` script for compilation

### Generated Service

Each app gets a systemd service at `/etc/systemd/system/bun-deploy-{name}.service`:

```ini
[Unit]
Description=Bun Deploy App: {name}
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/var/www/{name}
ExecStart=/usr/local/bin/bun run start
Restart=always

[Install]
WantedBy=multi-user.target
```

### Generated Nginx Config

```nginx
server {
    listen 80;
    server_name {domain};

    location / {
        proxy_pass http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

## Architecture

```
src/
  commands/           # CLI command handlers
    server.ts         # Server management commands
    app.ts            # App management commands
    config.ts         # Config management

  core/               # Core abstractions
    config-store.ts   # Local JSON config management
    ssh-client.ts     # SSH connection wrapper

  provisioners/       # Server setup scripts
    ubuntu-2404.ts    # Ubuntu 24.04 provisioning

  app-types/          # Pluggable app type handlers
    index.ts          # App type registry
    bun-app/          # Bun.js app handler
      index.ts

  types/              # TypeScript interfaces
    index.ts

  index.ts            # CLI entry point
```

## Requirements

- [Bun](https://bun.sh) 1.0+
- Target servers: Ubuntu 24.04 LTS
- SSH access with key authentication

## Development

```bash
# Run tests
bun test

# Type check
bun run tsc --noEmit

# Run CLI locally
bun run src/index.ts --help
```

## Licence

MIT
