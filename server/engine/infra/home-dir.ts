import * as os from 'node:os';
import * as path from 'node:path';
import { logger } from '../../logger.js';

export type HomeDirOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
};

export function getHomeDir(options: HomeDirOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  if (env.HOME) {
    return env.HOME;
  }

  if (platform === 'win32') {
    if (env.USERPROFILE) {
      return env.USERPROFILE;
    }
    if (env.HOMEDRIVE && env.HOMEPATH) {
      return path.join(env.HOMEDRIVE, env.HOMEPATH);
    }
  }

  try {
    return os.homedir();
  } catch {
    throw new Error('Unable to determine home directory');
  }
}

export function resolveHomePath(relativePath: string, options?: HomeDirOptions): string {
  if (relativePath.startsWith('~') || relativePath.startsWith('~/') || relativePath.startsWith('~\\')) {
    const home = getHomeDir(options);
    return path.join(home, relativePath.slice(1));
  }
  return path.resolve(relativePath);
}

export function expandHomeDir(p: string, options?: HomeDirOptions): string {
  return resolveHomePath(p, options);
}

export function pathInHome(relativePath: string, options?: HomeDirOptions): string {
  const home = getHomeDir(options);
  return path.join(home, relativePath);
}

export function isPathInHome(targetPath: string, options?: HomeDirOptions): boolean {
  const home = getHomeDir(options);
  const resolved = path.resolve(targetPath);
  const normalizedHome = path.normalize(home);
  return resolved === normalizedHome || resolved.startsWith(normalizedHome + path.sep);
}
