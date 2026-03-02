/**
 * Provider Registry - Manages cloud provider implementations
 *
 * To add a new provider:
 * 1. Create a directory under src/providers/your-provider/
 * 2. Implement the CloudProvider interface
 * 3. Register it here with registerProvider()
 */

import type { CloudProvider, ProviderFactory } from "../types/index.js";

// Import provider implementations
import { hetznerProvider } from "./hetzner/index.js";

// Registry of provider factories
const providerFactories = new Map<string, ProviderFactory>();

// Register built-in providers
registerProvider("hetzner", hetznerProvider);

/**
 * Register a new provider factory
 */
export function registerProvider(name: string, factory: ProviderFactory): void {
  providerFactories.set(name, factory);
}

/**
 * Get a provider instance by name
 */
export function getProvider(name: string): CloudProvider | null {
  const factory = providerFactories.get(name);
  return factory ? factory() : null;
}

/**
 * Get all registered provider names
 */
export function listProviderNames(): string[] {
  return Array.from(providerFactories.keys());
}

/**
 * Get all available providers (instantiated)
 */
export function getAllProviders(): CloudProvider[] {
  return Array.from(providerFactories.values()).map((factory) => factory());
}

/**
 * Get all providers that are available (CLI installed or API accessible)
 */
export async function getAvailableProviders(): Promise<CloudProvider[]> {
  const providers = getAllProviders();
  const availability = await Promise.all(
    providers.map(async (p) => ({ provider: p, available: await p.isAvailable() })),
  );
  return availability.filter((a) => a.available).map((a) => a.provider);
}

/**
 * Get all providers that are configured (authenticated)
 */
export async function getConfiguredProviders(): Promise<CloudProvider[]> {
  const providers = getAllProviders();
  const configurations = await Promise.all(
    providers.map(async (p) => ({
      provider: p,
      configured: await p.isConfigured(),
    })),
  );
  return configurations.filter((c) => c.configured).map((c) => c.provider);
}
