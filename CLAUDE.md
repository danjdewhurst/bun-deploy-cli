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
  commands/      # CLI command handlers (server.ts, app.ts, config.ts)
  core/          # Core abstractions (config-store.ts, ssh-client.ts)
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

## CLI Patterns

- Use Commander.js for argument parsing
- Validate early, exit with `process.exit(1)` on errors
- Use `console.log` for output, `console.error` for errors
- Follow existing command structure: `bun-deploy <resource> <action> <name>`
