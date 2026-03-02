/**
 * SSH Client Wrapper - SSH connection and command execution
 */
import { Client } from 'ssh2';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ServerConfig, SSHExecResult } from '../types/index.js';

export class SSHClient {
  private client: Client;
  private connected = false;

  constructor(private serverConfig: ServerConfig) {
    this.client = new Client();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { host, port, username, sshKeyPath, sshKeyPassphrase } = this.serverConfig;

      const connectConfig: any = {
        host,
        port: port || 22,
        username,
        readyTimeout: 30000,
      };

      if (sshKeyPath) {
        const keyPath = sshKeyPath.startsWith('~/')
          ? join(homedir(), sshKeyPath.slice(2))
          : sshKeyPath;
        connectConfig.privateKey = readFile(keyPath);
        if (sshKeyPassphrase) {
          connectConfig.passphrase = sshKeyPassphrase;
        }
      }

      this.client
        .on('ready', () => {
          this.connected = true;
          resolve();
        })
        .on('error', (err) => {
          reject(err);
        })
        .connect(connectConfig);
    });
  }

  async exec(command: string): Promise<SSHExecResult> {
    if (!this.connected) {
      throw new Error('SSH client not connected. Call connect() first.');
    }

    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';
        let code: number | null = null;

        stream
          .on('close', (exitCode: number) => {
            code = exitCode ?? 0;
            resolve({ stdout, stderr, code });
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
      });
    });
  }

  async execWithSudo(command: string, password?: string): Promise<SSHExecResult> {
    // Use sudo with non-interactive flag or provide password if needed
    const sudoCommand = password
      ? `echo '${password}' | sudo -S ${command}`
      : `sudo -n ${command}`;
    return this.exec(sudoCommand);
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    if (!this.connected) {
      throw new Error('SSH client not connected. Call connect() first.');
    }

    const content = await readFile(localPath);

    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        sftp.writeFile(remotePath, content, (writeErr) => {
          if (writeErr) {
            reject(writeErr);
          } else {
            resolve();
          }
        });
      });
    });
  }

  async uploadContent(content: string | Buffer, remotePath: string): Promise<void> {
    if (!this.connected) {
      throw new Error('SSH client not connected. Call connect() first.');
    }

    const buffer = typeof content === 'string' ? Buffer.from(content) : content;

    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        sftp.writeFile(remotePath, buffer, (writeErr) => {
          if (writeErr) {
            reject(writeErr);
          } else {
            resolve();
          }
        });
      });
    });
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    if (!this.connected) {
      throw new Error('SSH client not connected. Call connect() first.');
    }

    const { writeFile } = await import('node:fs/promises');

    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        sftp.readFile(remotePath, (readErr, data) => {
          if (readErr) {
            reject(readErr);
            return;
          }

          writeFile(localPath, data)
            .then(() => resolve())
            .catch(reject);
        });
      });
    });
  }

  async execScript(scriptContent: string, sudo = false, cwd?: string): Promise<SSHExecResult> {
    // Create a temporary script file on the remote server and execute it
    const timestamp = Date.now();
    const remoteScriptPath = `/tmp/bun-deploy-script-${timestamp}.sh`;

    // Upload the script
    await this.uploadContent(scriptContent, remoteScriptPath);

    // Make it executable and run it
    const execCommand = `chmod +x ${remoteScriptPath} && ${cwd ? `cd ${cwd} && ` : ''}${remoteScriptPath}; rm -f ${remoteScriptPath}`;
    const command = sudo ? `sudo bash -c '${execCommand}'` : execCommand;

    return this.exec(command);
  }

  async streamLogs(serviceName: string, follow = false): Promise<void> {
    if (!this.connected) {
      throw new Error('SSH client not connected. Call connect() first.');
    }

    const command = follow
      ? `journalctl -u ${serviceName} -f`
      : `journalctl -u ${serviceName} --no-pager`;

    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        stream
          .on('close', () => {
            resolve();
          })
          .on('data', (data: Buffer) => {
            process.stdout.write(data.toString());
          })
          .stderr.on('data', (data: Buffer) => {
            process.stderr.write(data.toString());
          });
      });
    });
  }

  disconnect(): void {
    if (this.connected) {
      this.client.end();
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Connect to a server and execute a callback, automatically disconnecting afterwards
 */
export async function withServer<T>(
  serverConfig: ServerConfig,
  callback: (client: SSHClient) => Promise<T>
): Promise<T> {
  const client = new SSHClient(serverConfig);

  try {
    await client.connect();
    return await callback(client);
  } finally {
    client.disconnect();
  }
}
