/**
 * App Type Registry - Plugin system for supporting different app types
 */
import type { AppConfig, AppTypeHandler } from "../types/index.js";
import { BunAppHandler } from "./bun-app/index.js";

const handlers = new Map<string, AppTypeHandler>();

// Register built-in handlers
registerAppType(new BunAppHandler());

export function registerAppType(handler: AppTypeHandler): void {
  handlers.set(handler.name, handler);
}

export function getAppTypeHandler(type: string): AppTypeHandler | undefined {
  return handlers.get(type);
}

export function listAppTypes(): AppTypeHandler[] {
  return Array.from(handlers.values());
}

export function appTypeExists(type: string): boolean {
  return handlers.has(type);
}
