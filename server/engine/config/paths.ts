import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';

export type ConfigPaths = {
  configDir: string;
  dataDir: string;
  pluginsDir: string;
  logDir: string;
  cacheDir: string;
};

export function resolveConfigDir(): string {
  const envDir = process.env.OPENCLAW_CONFIG_DIR;
  if (envDir) return resolve(envDir);

  const home = homedir();
  if (platform() === 'darwin') {
    return join(home, 'Library', 'Application Support', 'openclaw');
  }
  if (platform() === 'win32') {
    return join(home, 'AppData', 'Roaming', 'openclaw');
  }
  return join(home, '.config', 'openclaw');
}

export function resolveDataDir(): string {
  const envDir = process.env.OPENCLAW_DATA_DIR;
  if (envDir) return resolve(envDir);
  return join(resolveConfigDir(), 'data');
}

export function resolveConfigPath(relativePath: string): string {
  return resolve(resolveConfigDir(), relativePath);
}

export function resolvePaths(): ConfigPaths {
  const configDir = resolveConfigDir();
  return {
    configDir,
    dataDir: resolveDataDir(),
    pluginsDir: join(configDir, 'plugins'),
    logDir: join(configDir, 'logs'),
    cacheDir: join(configDir, 'cache'),
  };
}

// Auto-generated stub exports (added by auto-fix-exports.mjs)
export const resolveIsNixMode: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;

/**
 * 解析 OpenClaw 状态目录。
 * 优先使用 OPENCLAW_STATE_DIR 环境变量，否则回退到 ~/.openclaw。
 */
export function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const envDir = env.OPENCLAW_STATE_DIR;
  if (envDir) return resolve(envDir);
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return join(home, '.openclaw');
}

// openclaw compat: gateway port resolver used by plugin-sdk/core.ts
const DEFAULT_GATEWAY_PORT = 4152;

function parseGatewayPortEnvValue(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 65535) {
    return null;
  }
  return parsed;
}

export function resolveGatewayPort(
  cfg?: { gateway?: { port?: number } },
  env: NodeJS.ProcessEnv = process.env,
): number {
  const envRaw = env.OPENCLAW_GATEWAY_PORT?.trim();
  const envPort = parseGatewayPortEnvValue(envRaw);
  if (envPort !== null) {
    return envPort;
  }
  const configPort = cfg?.gateway?.port;
  if (typeof configPort === "number" && Number.isFinite(configPort)) {
    return configPort;
  }
  return DEFAULT_GATEWAY_PORT;
}
