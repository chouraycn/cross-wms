/**
 * 移植自 openclaw/src/agents/cli-runner/bundle-mcp-adapter-shared.ts
 *
 * Shared normalization helpers for CLI-specific bundle MCP adapters.
 */

function isRecord(value: any): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringArray(value: any): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? [...value]
    : undefined;
}

/** Normalize a string-valued record, dropping non-string entries. */
export function normalizeStringRecord(value: any): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const entries = Object.entries(value).filter((entry): entry is [string, string] => {
    return typeof entry[1] === "string";
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** Decode supported `${ENV}` and `Bearer ${ENV}` header placeholders. */
export function decodeHeaderEnvPlaceholder(
  value: string,
): { envVar: string; bearer: boolean } | null {
  const bearerMatch = /^Bearer \${([A-Z0-9_]+)}$/.exec(value);
  if (bearerMatch) {
    return { envVar: bearerMatch[1], bearer: true };
  }
  const envMatch = /^\${([A-Z0-9_]+)}$/.exec(value);
  if (envMatch) {
    return { envVar: envMatch[1], bearer: false };
  }
  return null;
}

/** Copy common MCP server config fields into a CLI adapter config object. */
export function applyCommonServerConfig(
  next: Record<string, any>,
  server: {
    command?: string;
    args?: any;
    env?: any;
    cwd?: string;
    url?: string;
  },
): void {
  if (typeof server.command === "string") {
    next.command = server.command;
  }
  const args = normalizeStringArray(server.args);
  if (args) {
    next.args = args;
  }
  const env = normalizeStringRecord(server.env);
  if (env) {
    next.env = env;
  }
  if (typeof server.cwd === "string") {
    next.cwd = server.cwd;
  }
  if (typeof server.url === "string") {
    next.url = server.url;
  }
}
