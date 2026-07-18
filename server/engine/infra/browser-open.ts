import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../../logger.js';

const execFileAsync = promisify(execFile);

export type BrowserOpenOptions = {
  app?: string;
  incognito?: boolean;
  background?: boolean;
  newWindow?: boolean;
};

async function isMacOS(): Promise<boolean> {
  return process.platform === 'darwin';
}

export async function openInBrowser(url: string, options: BrowserOpenOptions = {}): Promise<boolean> {
  try {
    const platform = process.platform;

    if (platform === 'darwin') {
      const args = [];
      if (options.app) {
        args.push('-a', options.app);
      }
      if (options.background) {
        args.push('-g');
      }
      if (options.newWindow) {
        args.push('-n');
      }
      args.push(url);

      await execFileAsync('open', args);
      return true;
    }

    if (platform === 'win32') {
      await execFileAsync('cmd', ['/c', 'start', '', url]);
      return true;
    }

    if (platform === 'linux') {
      const openers = ['xdg-open', 'gio', 'gnome-open', 'kde-open', 'wslview'];
      for (const opener of openers) {
        try {
          await execFileAsync(opener, [url]);
          return true;
        } catch {
          continue;
        }
      }
    }

    logger.warn(`[BrowserOpen] Unsupported platform: ${platform}`);
    return false;
  } catch (err) {
    logger.error(`[BrowserOpen] Failed to open URL: ${err}`);
    return false;
  }
}

export async function openUrl(url: string, options?: BrowserOpenOptions): Promise<boolean> {
  return openInBrowser(url, options);
}

export function getDefaultBrowser(): string | undefined {
  const platform = process.platform;
  
  if (platform === 'darwin') return 'Safari';
  if (platform === 'win32') return 'Edge';
  if (platform === 'linux') return 'xdg-open';
  
  return undefined;
}
