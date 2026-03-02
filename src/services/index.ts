/**
 * Service Registry - Plugin system for server infrastructure services
 */
import type { ServiceHandler } from "../types/index.js";
import { BunHandler } from "./bun/index.js";
import { CaddyHandler } from "./caddy/index.js";
import { MariaDBHandler } from "./mariadb/index.js";
import { MeilisearchHandler } from "./meilisearch/index.js";
import { MinioHandler } from "./minio/index.js";
import { RedisHandler } from "./redis/index.js";

const handlers = new Map<string, ServiceHandler>();

// Register built-in handlers
registerService(new BunHandler());
registerService(new CaddyHandler());
registerService(new RedisHandler());
registerService(new MariaDBHandler());
registerService(new MeilisearchHandler());
registerService(new MinioHandler());

export function registerService(handler: ServiceHandler): void {
  handlers.set(handler.name, handler);
}

export function getServiceHandler(name: string): ServiceHandler | undefined {
  return handlers.get(name);
}

export function listServices(): ServiceHandler[] {
  return Array.from(handlers.values());
}

export function listServicesByCategory(category: ServiceHandler["category"]): ServiceHandler[] {
  return Array.from(handlers.values()).filter((h) => h.category === category);
}

export function serviceExists(name: string): boolean {
  return handlers.has(name);
}

export function getCategories(): string[] {
  const categories = new Set<string>();
  for (const handler of handlers.values()) {
    categories.add(handler.category);
  }
  return Array.from(categories);
}
