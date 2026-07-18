import { logger } from '../../logger.js';

export function quoteShellArg(arg: string): string {
  if (/[^A-Za-z0-9_/:=-]/.test(arg)) {
    return "'" + arg.replace(/'/g, "'\\''") + "'";
  }
  return arg;
}

export function buildShellCommand(args: string[]): string {
  return args.map(quoteShellArg).join(' ');
}

export function parseShellCommand(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (char === ' ' && !inSingle && !inDouble) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

export function getShellName(): string {
  return process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh');
}

export function isSafeCommand(command: string): boolean {
  const dangerousPatterns = [
    /rm\s+-rf\s+\//,
    /dd\s+if=/,
    /mkfs\./,
    /:/,
    /sudo\s+rm/,
    /chmod\s+777/,
    />\s*\/dev\/sda/,
    /curl\s+.*\|\s*bash/,
    /wget\s+.*\|\s*bash/,
  ];

  return !dangerousPatterns.some(pattern => pattern.test(command));
}

export function expandTilde(path: string): string {
  if (path.startsWith('~') && (path.length === 1 || path[1] === '/')) {
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    return home + path.slice(1);
  }
  return path;
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function joinPaths(...parts: string[]): string {
  return normalizePath(parts.join('/'));
}

export function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.slice(dotIndex).toLowerCase() : '';
}

export function isExecutable(filename: string): boolean {
  const ext = getFileExtension(filename).toLowerCase();
  const executableExtensions = ['.exe', '.sh', '.bat', '.cmd', '.ps1', '.app'];
  return executableExtensions.includes(ext);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function truncateText(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function mergeDeep<T>(target: T, source: Partial<T>): T {
  const result = { ...target } as Record<string, unknown>;
  
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (typeof result[key] === 'object' && !Array.isArray(result[key])) {
        result[key] = mergeDeep(result[key] as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  
  return result as T;
}

logger.debug('[Agents:ShellUtils] Module loaded');
