/**
 * Resolve configuration values that may be shell commands, environment variables, or literals.
 * Ported from openclaw/src/agents/sessions/resolve-config-value.ts
 *
 * Used by auth-storage.ts and model-registry.ts.
 */

import { execSync } from "node:child_process";

// Cache for shell command results (persists for process lifetime)
const commandResultCache = new Map<string, string | undefined>();

/**
 * Resolve a config value (API key, header value, etc.) to an actual value.
 * - If starts with "!", executes the rest as a shell command and uses stdout (cached)
 * - Otherwise checks environment variable first, then treats as literal (not cached)
 */
export function resolveConfigValue(config: string): string | undefined {
  if (config.startsWith("!")) {
    return executeCommand(config);
  }
  const envValue = process.env[config];
  return envValue || config;
}

function executeCommandUncached(commandConfig: string): string | undefined {
  const command = commandConfig.slice(1);
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.trim() || undefined;
  } catch {
    return undefined;
  }
}

function executeCommand(commandConfig: string): string | undefined {
  if (commandResultCache.has(commandConfig)) {
    return commandResultCache.get(commandConfig);
  }

  const result = executeCommandUncached(commandConfig);
  commandResultCache.set(commandConfig, result);
  return result;
}

/**
 * Resolve all header values using the same resolution logic as API keys, but uncached.
 */
export function resolveConfigValueUncached(config: string): string | undefined {
  if (config.startsWith("!")) {
    return executeCommandUncached(config);
  }
  const envValue = process.env[config];
  return envValue || config;
}

export function resolveConfigValueOrThrow(config: string, description: string): string {
  const resolvedValue = resolveConfigValueUncached(config);
  if (resolvedValue !== undefined) {
    return resolvedValue;
  }

  if (config.startsWith("!")) {
    throw new Error(`Failed to resolve ${description} from shell command: ${config.slice(1)}`);
  }

  throw new Error(`Failed to resolve ${description}`);
}

export function resolveHeadersOrThrow(
  headers: Record<string, string> | undefined,
  description: string,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = resolveConfigValueOrThrow(value, `${description} header "${key}"`);
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

/** Clear the config value command cache. Exported for testing. */
export function clearConfigValueCache(): void {
  commandResultCache.clear();
}
