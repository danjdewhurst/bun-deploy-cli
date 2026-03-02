/**
 * Ubuntu 24.04 Provisioner - Automated server setup
 */

import { saveServer } from "../core/config-store.js";
import { type SSHClient, withServer } from "../core/ssh-client.js";
import type { ServerConfig } from "../types/index.js";

const SETUP_SCRIPT = `#!/bin/bash
set -e

echo "=== Starting Ubuntu 24.04 Server Setup ==="

# Update system
echo "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# Install essential packages
echo "Installing essential packages..."
apt-get install -y -qq curl git ufw fail2ban htop jq build-essential nginx

# Configure UFW firewall
echo "Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# Configure fail2ban
echo "Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# Install Bun
echo "Installing Bun..."
export BUN_INSTALL=/usr/local
curl -fsSL https://bun.sh/install | bash
ln -sf /usr/local/bin/bun /usr/local/bin/bun

# Install Node.js via Volta (optional but useful for compatibility)
echo "Installing Volta for Node.js management..."
curl https://get.volta.sh | bash -s -- --skip-setup
export VOLTA_HOME=/root/.volta
export PATH="$VOLTA_HOME/bin:$PATH"
volta install node

# Create deploy user
echo "Creating deploy user..."
if ! id "deploy" &> /dev/null; then
  useradd -m -s /bin/bash -G sudo deploy
  # Allow deploy user to use sudo without password for specific commands
  echo "deploy ALL=(ALL) NOPASSWD: /bin/systemctl * bun-deploy-*" > /etc/sudoers.d/bun-deploy
  echo "deploy ALL=(ALL) NOPASSWD: /usr/bin/nginx" >> /etc/sudoers.d/bun-deploy
fi

# Set up /var/www directory
echo "Setting up web directories..."
mkdir -p /var/www
chown deploy:deploy /var/www

# Configure automatic security updates
echo "Configuring automatic security updates..."
apt-get install -y -qq unattended-upgrades
systemctl enable unattended-upgrades
systemctl start unattended-upgrades

# Configure logrotate
echo "Setting up log rotation..."
cat > /etc/logrotate.d/bun-deploy <> 'EOF'
/var/www/*/logs/*.log {
  daily
  rotate 14
  compress
  delaycompress
  missingok
  notifempty
  create 0644 deploy deploy
  sharedscripts
  postrotate
    systemctl reload nginx > /dev/null 2>&1 || true
  endscript
}
EOF

# Configure nginx
systemctl enable nginx
systemctl start nginx

# Create logs directory template
mkdir -p /var/log/bun-deploy
chown deploy:deploy /var/log/bun-deploy

echo "=== Server Setup Complete ==="
echo "Installed:"
echo "  - System updates"
echo "  - UFW firewall"
echo "  - Fail2ban"
echo "  - Bun $(bun --version)"
echo "  - Nginx $(nginx -v 2>&1 | head -1)"
echo "  - Deploy user"
`;

export async function provisionUbuntu2404(server: ServerConfig): Promise<void> {
  await withServer(server, async (client: SSHClient) => {
    // Update server state to provisioning
    server.state = "provisioning";
    await saveServer(server);

    try {
      // Upload and execute setup script
      const timestamp = Date.now();
      const remoteScriptPath = `/tmp/setup-ubuntu-${timestamp}.sh`;

      console.log("Uploading setup script...");
      await client.uploadContent(SETUP_SCRIPT, remoteScriptPath);

      console.log("Running setup script (this may take a few minutes)...");
      console.log("  Installing system packages, Bun, Nginx, and security tools...");

      const result = await client.exec(`bash ${remoteScriptPath}`);

      // Clean up script
      await client.exec(`rm -f ${remoteScriptPath}`);

      if (result.code !== 0) {
        throw new Error(`Setup script failed: ${result.stderr}`);
      }

      console.log(result.stdout);

      // Verify installation
      console.log("\nVerifying installation...");
      const bunVersion = await client.exec("bun --version");
      const nginxVersion = await client.exec("nginx -v 2>&1");
      const ufwStatus = await client.exec("ufw status | head -1");

      console.log(`Bun version: ${bunVersion.stdout.trim()}`);
      console.log(`Nginx: ${nginxVersion.stderr.trim() || nginxVersion.stdout.trim()}`);
      console.log(`Firewall: ${ufwStatus.stdout.trim()}`);

      // Update server state to ready
      server.state = "ready";
      server.provisionedAt = new Date().toISOString();
      server.installedApps = ["bun", "nginx", "ufw", "fail2ban"];
      await saveServer(server);
    } catch (error) {
      // Update server state to error
      server.state = "error";
      await saveServer(server);
      throw error;
    }
  });
}
