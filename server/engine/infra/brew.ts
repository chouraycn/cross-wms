import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../../logger.js';

const execFileAsync = promisify(execFile);

export type BrewPackageInfo = {
  name: string;
  version: string;
  installed: boolean;
  description?: string;
  homepage?: string;
};

export type BrewOptions = {
  cask?: boolean;
};

async function isBrewAvailable(): Promise<boolean> {
  try {
    await execFileAsync('which', ['brew']);
    return true;
  } catch {
    return false;
  }
}

export async function brewInstalled(): Promise<boolean> {
  return isBrewAvailable();
}

export async function brewInstall(packageName: string, options: BrewOptions = {}): Promise<boolean> {
  if (!await isBrewAvailable()) {
    throw new Error('Homebrew is not installed');
  }

  const args = ['install'];
  if (options.cask) {
    args.push('--cask');
  }
  args.push(packageName);

  try {
    await execFileAsync('brew', args);
    logger.info(`[Brew] Installed ${packageName}`);
    return true;
  } catch (err) {
    logger.error(`[Brew] Failed to install ${packageName}: ${err}`);
    return false;
  }
}

export async function brewUninstall(packageName: string, options: BrewOptions = {}): Promise<boolean> {
  if (!await isBrewAvailable()) {
    throw new Error('Homebrew is not installed');
  }

  const args = ['uninstall'];
  if (options.cask) {
    args.push('--cask');
  }
  args.push(packageName);

  try {
    await execFileAsync('brew', args);
    logger.info(`[Brew] Uninstalled ${packageName}`);
    return true;
  } catch (err) {
    logger.error(`[Brew] Failed to uninstall ${packageName}: ${err}`);
    return false;
  }
}

export async function brewList(options: BrewOptions = {}): Promise<BrewPackageInfo[]> {
  if (!await isBrewAvailable()) {
    throw new Error('Homebrew is not installed');
  }

  const args = ['list', '--versions'];
  if (options.cask) {
    args.push('--cask');
  }

  try {
    const { stdout } = await execFileAsync('brew', args);
    const lines = stdout.trim().split('\n').filter(Boolean);
    return lines.map(line => {
      const [name, version] = line.split(' ');
      return {
        name: name ?? '',
        version: version ?? '',
        installed: true,
      };
    });
  } catch (err) {
    logger.error(`[Brew] Failed to list packages: ${err}`);
    return [];
  }
}

export async function brewInfo(packageName: string, options: BrewOptions = {}): Promise<BrewPackageInfo | undefined> {
  if (!await isBrewAvailable()) {
    throw new Error('Homebrew is not installed');
  }

  const args = ['info'];
  if (options.cask) {
    args.push('--cask');
  }
  args.push(packageName);

  try {
    const { stdout } = await execFileAsync('brew', args);
    const lines = stdout.trim().split('\n');
    
    const name = packageName;
    let version = '';
    let description = '';
    let homepage = '';
    let installed = false;

    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':').map(s => s.trim());
        if (key === 'Desc') description = value;
        if (key === 'Homepage') homepage = value;
      } else if (line.startsWith(packageName)) {
        const parts = line.split(' ');
        if (parts.length >= 2) {
          version = parts[1] ?? '';
        }
        if (line.includes('Installed')) {
          installed = true;
        }
      }
    }

    return {
      name,
      version,
      installed,
      description: description || undefined,
      homepage: homepage || undefined,
    };
  } catch {
    return undefined;
  }
}

export async function brewIsInstalled(packageName: string, options: BrewOptions = {}): Promise<boolean> {
  const info = await brewInfo(packageName, options);
  return info?.installed ?? false;
}

export async function brewUpgrade(packageName?: string, options: BrewOptions = {}): Promise<boolean> {
  if (!await isBrewAvailable()) {
    throw new Error('Homebrew is not installed');
  }

  const args = ['upgrade'];
  if (options.cask) {
    args.push('--cask');
  }
  if (packageName) {
    args.push(packageName);
  }

  try {
    await execFileAsync('brew', args);
    logger.info(`[Brew] Upgraded ${packageName ?? 'all packages'}`);
    return true;
  } catch (err) {
    logger.error(`[Brew] Failed to upgrade: ${err}`);
    return false;
  }
}

export async function brewSearch(query: string, options: BrewOptions = {}): Promise<string[]> {
  if (!await isBrewAvailable()) {
    throw new Error('Homebrew is not installed');
  }

  const args = ['search', query];
  if (options.cask) {
    args.push('--cask');
  }

  try {
    const { stdout } = await execFileAsync('brew', args);
    return stdout.trim().split('\n').filter(Boolean);
  } catch (err) {
    logger.error(`[Brew] Search failed: ${err}`);
    return [];
  }
}
