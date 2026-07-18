import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { daemonCommand } from '../daemon.js';

describe('CLI daemon command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('has correct command name and description', () => {
    expect(daemonCommand.name()).toBe('daemon');
    expect(daemonCommand.description()).toContain('守护进程');
  });

  it('shows help output', () => {
    const helpInformation = daemonCommand.helpInformation();
    expect(helpInformation).toContain('start');
    expect(helpInformation).toContain('stop');
    expect(helpInformation).toContain('status');
    expect(helpInformation).toContain('logs');
  });

  it('start subcommand outputs start message', async () => {
    await daemonCommand.parseAsync(['node', 'test', 'start']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(
      calls.some(
        (line) =>
          line.includes('守护进程已启动') || line.includes('守护进程已在运行')
      )
    ).toBe(true);
  });

  it('status subcommand outputs status', async () => {
    await daemonCommand.parseAsync(['node', 'test', 'status']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('守护进程状态'))).toBe(true);
  });
});
