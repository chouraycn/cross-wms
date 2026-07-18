import { describe, it, expect } from 'vitest';
import {
  resolveHomeDir,
  resolveDaemonStateDir,
  resolveDaemonPaths,
  resolveDaemonTaskScriptPath,
} from '../paths.js';
import { isProcessAlive } from '../inspect.js';
import { formatDaemonStatus, formatDaemonList, formatLine, toPosixPath } from '../output.js';
import type { DaemonServiceStatus } from '../service.js';

describe('daemon > paths', () => {
  it('resolves home directory from env', () => {
    expect(resolveHomeDir({ HOME: '/home/alice' })).toBe('/home/alice');
    expect(resolveHomeDir({ USERPROFILE: 'C:\\Users\\Alice' })).toBe('C:\\Users\\Alice');
    expect(() => resolveHomeDir({})).toThrow('无法解析用户主目录');
  });

  it('resolves daemon state dir', () => {
    const dir = resolveDaemonStateDir({ HOME: '/home/alice' });
    expect(dir).toContain('.cdf-know');
    expect(dir.startsWith('/home/alice')).toBe(true);
  });

  it('supports CDF_STATE_DIR override', () => {
    const dir = resolveDaemonStateDir({ HOME: '/home/alice', CDF_STATE_DIR: '/custom/state' });
    expect(dir).toBe('/custom/state');
  });

  it('supports profile suffix', () => {
    const dir = resolveDaemonStateDir({ HOME: '/home/alice', CDF_PROFILE: 'prod' });
    expect(dir).toContain('.cdf-know-prod');
  });

  it('resolves daemon paths', () => {
    const paths = resolveDaemonPaths({ env: { HOME: '/home/alice' } });
    expect(paths.homeDir).toBe('/home/alice');
    expect(paths.stateDir).toContain('.cdf-know');
    expect(paths.pidFilePath).toContain('daemon.pid');
    expect(paths.launchdPlistPath).toContain('com.cdf-know.daemon.plist');
  });

  it('resolves task script path', () => {
    const path = resolveDaemonTaskScriptPath({ HOME: '/home/alice' });
    expect(path).toContain('daemon.cmd');
  });

  it('rejects task script names with paths', () => {
    expect(() => resolveDaemonTaskScriptPath({ HOME: '/home/alice', CDF_TASK_SCRIPT_NAME: '../evil.cmd' })).toThrow();
  });
});

describe('daemon > inspect', () => {
  it('reports current process as alive', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('reports non-existent process as dead', () => {
    expect(isProcessAlive(99999999)).toBe(false);
  });
});

describe('daemon > output', () => {
  it('formats daemon status as table', () => {
    const status: DaemonServiceStatus = {
      name: 'cdf-know-daemon',
      platform: 'darwin',
      installed: true,
      running: true,
      pid: 1234,
      state: 'running',
      uptimeMs: 3661000,
      memoryUsage: 1024 * 1024 * 42,
      detail: 'healthy',
    };
    const output = formatDaemonStatus(status);
    expect(output).toContain('cdf-know-daemon');
    expect(output).toContain('1234');
    expect(output).toContain('healthy');
  });

  it('formats daemon status as JSON', () => {
    const status: DaemonServiceStatus = {
      name: 'cdf-know-daemon',
      platform: 'linux',
      installed: false,
      running: false,
    };
    const output = formatDaemonStatus(status, 'json');
    const parsed = JSON.parse(output) as DaemonServiceStatus;
    expect(parsed.name).toBe('cdf-know-daemon');
  });

  it('formats daemon list', () => {
    const statuses: DaemonServiceStatus[] = [
      { name: 'a', platform: 'darwin', installed: true, running: true, pid: 1, state: 'running' },
      { name: 'b', platform: 'linux', installed: false, running: false },
    ];
    const output = formatDaemonList(statuses);
    expect(output).toContain('a');
    expect(output).toContain('b');
  });

  it('formats empty daemon list', () => {
    expect(formatDaemonList([])).toContain('（无守护进程）');
  });

  it('formats labeled lines', () => {
    expect(formatLine('PID', '1234')).toBe('PID: 1234');
  });

  it('normalizes paths to posix', () => {
    expect(toPosixPath('C:\\foo\\bar')).toBe('C:/foo/bar');
  });
});
