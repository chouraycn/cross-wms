import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn(() => false),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import { Sandbox, createSandbox } from '../sandbox.js';

describe('node-host/sandbox', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox({ timeoutMs: 5000, maxMemoryMB: 256 });
  });

  describe('execute', () => {
    it('执行成功的命令', async () => {
      const result = await sandbox.execute('echo', ['hello world']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hello world');
      expect(result.stderr).toBe('');
      expect(result.timedOut).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('捕获 stderr', async () => {
      const result = await sandbox.execute('sh', ['-c', 'echo error >&2']);
      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toBe('error');
    });

    it('非零退出码', async () => {
      const result = await sandbox.execute('sh', ['-c', 'exit 42']);
      expect(result.exitCode).toBe(42);
      expect(result.success === undefined || result.timedOut === false).toBe(true);
    });

    it('返回 durationMs', async () => {
      const result = await sandbox.execute('echo', ['test']);
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('返回 memoryUsedBytes', async () => {
      const result = await sandbox.execute('echo', ['test']);
      expect(typeof result.memoryUsedBytes).toBe('number');
    });
  });

  describe('超时', () => {
    it('命令超时返回 timedOut', async () => {
      const result = await sandbox.execute('sleep', ['2'], { timeoutMs: 100 });
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(-1);
    }, { timeout: 5000 });
  });

  describe('路径检查', () => {
    it('isPathAllowed 没有限制时都允许', () => {
      expect(sandbox.isPathAllowed('/tmp/test')).toBe(true);
      expect(sandbox.isPathAllowed('/etc/passwd')).toBe(true);
    });

    it('isPathAllowed 检查 deniedPaths', () => {
      sandbox = createSandbox({ deniedPaths: ['/etc/'] });
      expect(sandbox.isPathAllowed('/etc/passwd')).toBe(false);
      expect(sandbox.isPathAllowed('/tmp/test')).toBe(true);
    });

    it('isPathAllowed 检查 allowedPaths', () => {
      sandbox = createSandbox({ allowedPaths: ['/tmp/', '/home/'] });
      expect(sandbox.isPathAllowed('/tmp/file')).toBe(true);
      expect(sandbox.isPathAllowed('/etc/passwd')).toBe(false);
    });

    it('deniedPaths 优先于 allowedPaths', () => {
      sandbox = createSandbox({
        allowedPaths: ['/tmp/'],
        deniedPaths: ['/tmp/secret/'],
      });
      expect(sandbox.isPathAllowed('/tmp/test')).toBe(true);
      expect(sandbox.isPathAllowed('/tmp/secret/file')).toBe(false);
    });
  });

  describe('选项管理', () => {
    it('getOptions 返回选项', () => {
      const opts = sandbox.getOptions();
      expect(opts.timeoutMs).toBe(5000);
      expect(opts.maxMemoryMB).toBe(256);
    });

    it('getOptions 返回只读副本', () => {
      const opts = sandbox.getOptions() as { timeoutMs: number };
      opts.timeoutMs = 999;
      expect(sandbox.getOptions().timeoutMs).toBe(5000);
    });

    it('updateOptions 更新选项', () => {
      sandbox.updateOptions({ timeoutMs: 10000 });
      expect(sandbox.getOptions().timeoutMs).toBe(10000);
    });
  });

  describe('工厂函数', () => {
    it('createSandbox 创建实例', () => {
      const s = createSandbox();
      expect(s).toBeInstanceOf(Sandbox);
    });

    it('createSandbox 带选项', () => {
      const s = createSandbox({ timeoutMs: 1000 });
      expect(s.getOptions().timeoutMs).toBe(1000);
    });
  });

  describe('cwd 选项', () => {
    it('使用指定的工作目录', async () => {
      const result = await sandbox.execute('pwd', [], { cwd: '/tmp' });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/\/tmp$/);
    });
  });

  describe('env 选项', () => {
    it('传递环境变量', async () => {
      const result = await sandbox.execute('sh', ['-c', 'echo $TEST_VAR'], {
        env: { TEST_VAR: 'hello_env' },
      });
      expect(result.stdout.trim()).toBe('hello_env');
    });
  });
});
