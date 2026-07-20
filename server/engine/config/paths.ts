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
export const resolveIsNixMode: any = undefined as any;
export const resolveStateDir: any = undefined as any;
