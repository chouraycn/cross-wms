import * as os from 'node:os';
import * as path from 'node:path';
import { logger } from '../../logger.js';

export type HomeDirOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
};

function normalizeHomeValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
    return undefined;
  }
  return trimmed;
}

function resolveTermuxHome(env: NodeJS.ProcessEnv): string | undefined {
  const prefix = normalizeHomeValue(env.PREFIX);
  if (!prefix || !normalizeHomeValue(env.ANDROID_DATA)) {
    return undefined;
  }
  if (!/(?:^|\/)com\.termux\/files\/usr\/?$/u.test(prefix.replace(/\\/gu, '/'))) {
    return undefined;
  }
  return path.resolve(prefix, '..', 'home');
}

function resolveRawOsHomeDir(
  env: NodeJS.ProcessEnv,
  homedir: () => string = os.homedir,
): string | undefined {
  const fromHomedir = (() => {
    try {
      return normalizeHomeValue(homedir());
    } catch {
      return undefined;
    }
  })();
  return (
    normalizeHomeValue(env.HOME) ??
    normalizeHomeValue(env.USERPROFILE) ??
    resolveTermuxHome(env) ??
    fromHomedir
  );
}

function resolveRawEffectiveHomeDir(
  env: NodeJS.ProcessEnv,
  homedir: () => string = os.homedir,
): string | undefined {
  const explicitHome = normalizeHomeValue(env.OPENCLAW_HOME);
  if (!explicitHome) {
    return resolveRawOsHomeDir(env, homedir);
  }
  if (
    explicitHome === '~' ||
    explicitHome.startsWith('~/') ||
    explicitHome.startsWith('~\\')
  ) {
    const fallbackHome = resolveRawOsHomeDir(env, homedir);
    return fallbackHome
      ? explicitHome.replace(/^~(?=$|[\\/])/, fallbackHome)
      : undefined;
  }
  return explicitHome;
}

/** 解析 effective home（优先 OPENCLAW_HOME，再回退 OS home）。 */
export function resolveEffectiveHomeDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string | undefined {
  const raw = resolveRawEffectiveHomeDir(env, homedir);
  return raw ? path.resolve(raw) : undefined;
}

/** 解析 OS home（忽略 OPENCLAW_HOME 覆盖）。 */
export function resolveOsHomeDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string | undefined {
  const raw = resolveRawOsHomeDir(env, homedir);
  return raw ? path.resolve(raw) : undefined;
}

/** 解析 effective home，无 home 源时回退到 cwd。 */
export function resolveRequiredHomeDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  return resolveEffectiveHomeDir(env, homedir) ?? path.resolve(process.cwd());
}

/** 解析 OS home，无 OS home 源时回退到 cwd。 */
export function resolveRequiredOsHomeDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  return resolveOsHomeDir(env, homedir) ?? path.resolve(process.cwd());
}

/** 展开前导的 `~`、`~/` 或 `~\`，使用 effective home（若已知）。 */
export function expandHomePrefix(
  input: string,
  opts?: {
    home?: string;
    env?: NodeJS.ProcessEnv;
    homedir?: () => string;
  },
): string {
  if (!input.startsWith('~')) {
    return input;
  }
  const home =
    normalizeHomeValue(opts?.home) ??
    resolveEffectiveHomeDir(
      opts?.env ?? process.env,
      opts?.homedir ?? os.homedir,
    );
  if (!home) {
    return input;
  }
  return input.replace(/^~(?=$|[\\/])/, home);
}

/** 解析用户输入路径，先 trim 再用 effective home 展开。 */
export function resolveHomeRelativePath(
  input: string,
  opts?: {
    env?: NodeJS.ProcessEnv;
    homedir?: () => string;
  },
): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith('~')) {
    const expanded = expandHomePrefix(trimmed, {
      home: resolveRequiredHomeDir(
        opts?.env ?? process.env,
        opts?.homedir ?? os.homedir,
      ),
      env: opts?.env,
      homedir: opts?.homedir,
    });
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
}

/** 解析用户输入路径（用 OS home，忽略 OPENCLAW_HOME）。 */
export function resolveOsHomeRelativePath(
  input: string,
  opts?: {
    env?: NodeJS.ProcessEnv;
    homedir?: () => string;
  },
): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith('~')) {
    const expanded = expandHomePrefix(trimmed, {
      home: resolveRequiredOsHomeDir(
        opts?.env ?? process.env,
        opts?.homedir ?? os.homedir,
      ),
      env: opts?.env,
      homedir: opts?.homedir,
    });
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
}

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
