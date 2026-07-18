import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nodesCommand } from '../nodes.js';

describe('CLI nodes command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('has correct command name and description', () => {
    expect(nodesCommand.name()).toBe('nodes');
    expect(nodesCommand.description()).toContain('节点');
  });

  it('shows help output', () => {
    const helpInformation = nodesCommand.helpInformation();
    expect(helpInformation).toContain('list');
    expect(helpInformation).toContain('status');
  });

  it('list subcommand outputs node list', async () => {
    await nodesCommand.parseAsync(['node', 'test', 'list']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('节点列表'))).toBe(true);
  });

  it('status subcommand outputs node status summary', async () => {
    await nodesCommand.parseAsync(['node', 'test', 'status']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('节点状态汇总'))).toBe(true);
  });
});
