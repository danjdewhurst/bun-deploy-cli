---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

---

## Project Structure

This is a CLI tool for deploying applications to Ubuntu servers.

```
src/
  commands/      # CLI command handlers (server.ts, app.ts, config.ts, provider.ts)
  core/          # Core abstractions (config-store.ts, ssh-client.ts)
  providers/     # Cloud provider implementations
    index.ts     # Provider registry
    hetzner/     # Hetzner Cloud provider
  provisioners/  # Server setup scripts (ubuntu-2404.ts)
  app-types/     # Pluggable app type handlers
    bun-app/     # Bun.js applications
    laravel-app/ # Laravel 12 + PHP 8.4 applications
  types/         # Shared TypeScript interfaces
  index.ts       # CLI entry point
```

## Adding New App Types

To add support for a new application type:

1. Create `src/app-types/my-app/index.ts`
2. Implement the `AppTypeHandler` interface
3. Register in `src/app-types/index.ts`

Example:
```typescript
export class MyAppHandler implements AppTypeHandler {
  readonly name = "my-app";
  readonly description = "Description";

  async validate(config: AppConfig): Promise<boolean> { return true; }
  generateDeployScript(config: AppConfig): string { return ""; }
  generateNginxConfig(config: AppConfig): string { return ""; }
  generateSystemdService(config: AppConfig): string { return ""; }
  getSetupCommands(config: AppConfig): string[] { return []; }
  getHealthCheck(config: AppConfig): { path: string; expectedStatus: number } {
    return { path: "/health", expectedStatus: 200 };
  }
}
```

## Code Style

- Use **Biome** for formatting and linting: `bun run check`
- 2-space indentation, double quotes, trailing commas
- Organise imports with Biome (automated on check)

## Testing

Use `bun test` for unit tests. Integration tests should mock SSH connections.

## Cloud Provider System

The CLI has an extensible provider system that supports both CLI-based and API-based cloud providers.

### Universal Provider Commands

```bash
# Check all provider statuses
bun-deploy provider status

# Configure a provider
bun-deploy provider configure hetzner --token <your-token>

# List servers from all configured providers
bun-deploy provider list
bun-deploy provider list hetzner  # specific provider

# Create a server via any provider
bun-deploy provider create hetzner my-server --type cx22 --location nbg1

# Sync servers to local config
bun-deploy provider sync
bun-deploy provider sync hetzner --prefix my-project-

# Delete a server
bun-deploy provider delete hetzner my-server --force
```

## Adding New Cloud Providers

To add support for a new cloud provider (e.g., AWS, DigitalOcean, Linode):

1. Create `src/providers/your-provider/index.ts`
2. Implement the `CloudProvider` interface
3. Register in `src/providers/index.ts` with `registerProvider()`

Example provider implementation:

```typescript
import type { CloudProvider, CloudServer, CreateServerOptions, ProviderStatus } from "../../types/index.js";

class MyProvider implements CloudProvider {
  readonly name = "myprovider";
  readonly displayName = "My Cloud Provider";
  readonly description = "Description of the provider";
  readonly type = "api"; // or "cli"

  async isAvailable(): Promise<boolean> { return true; }
  async isConfigured(): Promise<boolean> { return true; }
  async configure(credentials: Record<string, string>): Promise<void> {}
  async getStatus(): Promise<ProviderStatus> { return { available: true, configured: true }; }
  async listServers(): Promise<CloudServer[]> { return []; }
  async createServer(options: CreateServerOptions): Promise<CloudServer> { throw new Error("Not implemented"); }
  async deleteServer(identifier: string): Promise<void> {}
  async getServer(identifier: string): Promise<CloudServer | null> { return null; }
  async syncServers(saveFn: (config: ServerConfig) => Promise<void>, filter?: (server: CloudServer) => boolean): Promise<number> { return 0; }
}

export function myProvider(): CloudProvider {
  return new MyProvider();
}
```

Then register it:

```typescript
// src/providers/index.ts
import { myProvider } from "./your-provider/index.js";
registerProvider("myprovider", myProvider);
```

## CLI Patterns

- Use Commander.js for argument parsing
- Validate early, exit with `process.exit(1)` on errors
- Use `console.log` for output, `console.error` for errors
- Follow existing command structure: `bun-deploy <resource> <action> <name>`
