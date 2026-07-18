import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gatewayCommand } from '../gateway.js';

describe('CLI gateway command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('has correct command name and description', () => {
    expect(gatewayCommand.name()).toBe('gateway');
    expect(gatewayCommand.description()).toContain('网关');
  });

  it('shows help output', () => {
    const helpInformation = gatewayCommand.helpInformation();
    expect(helpInformation).toContain('status');
    expect(helpInformation).toContain('probe');
    expect(helpInformation).toContain('net');
  });

  it('status subcommand outputs gateway status', async () => {
    await gatewayCommand.parseAsync(['node', 'test', 'status']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('网关状态'))).toBe(true);
  });

  it('probe subcommand outputs probe result', async () => {
    await gatewayCommand.parseAsync(['node', 'test', 'probe']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('探测'))).toBe(true);
  });

  it('net subcommand outputs network stats', async () => {
    await gatewayCommand.parseAsync(['node', 'test', 'net']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('网络统计'))).toBe(true);
  });
});
