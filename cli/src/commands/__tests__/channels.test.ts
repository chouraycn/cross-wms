import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { channelsCommand } from '../channels.js';

describe('CLI channels command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let tempDir: string;
  let originalStateDir: string | undefined;

  beforeEach(async () => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'channels-test-'));
    originalStateDir = process.env.CROSSWMS_STATE_DIR;
    process.env.CROSSWMS_STATE_DIR = tempDir;
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    if (originalStateDir === undefined) {
      delete process.env.CROSSWMS_STATE_DIR;
    } else {
      process.env.CROSSWMS_STATE_DIR = originalStateDir;
    }
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('has correct command name and description', () => {
    expect(channelsCommand.name()).toBe('channels');
    expect(channelsCommand.description()).toContain('通道管理');
  });

  it('shows help output with all subcommands', () => {
    const help = channelsCommand.helpInformation();
    expect(help).toContain('list');
    expect(help).toContain('status');
    expect(help).toContain('install');
    expect(help).toContain('uninstall');
    expect(help).toContain('enable');
    expect(help).toContain('disable');
  });

  it('list shows bundled channels by default', async () => {
    await channelsCommand.parseAsync(['node', 'test', 'list']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('通道目录'))).toBe(true);
    expect(calls.some((line) => line.includes('feishu'))).toBe(true);
    expect(calls.some((line) => line.includes('slack'))).toBe(true);
  });

  it('list with --all shows installable catalog too', async () => {
    await channelsCommand.parseAsync(['node', 'test', 'list', '--all']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('whatsapp'))).toBe(true);
    expect(calls.some((line) => line.includes('matrix'))).toBe(true);
  });

  it('install a bundled channel returns installed=true', async () => {
    await channelsCommand.parseAsync(['node', 'test', 'install', 'feishu']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('feishu'))).toBe(true);
  });

  it('install an installable channel records it', async () => {
    await channelsCommand.parseAsync(['node', 'test', 'install', 'whatsapp']);

    // 检查文件
    const file = path.join(tempDir, 'channels.json');
    const data = JSON.parse(await fs.readFile(file, 'utf-8'));
    expect(data.installedIds).toContain('whatsapp');
  });

  it('install unknown channel throws', async () => {
    await expect(
      channelsCommand.parseAsync(['node', 'test', 'install', 'unknown-channel-xyz']),
    ).rejects.toThrow();
  });

  it('uninstall bundled channel throws', async () => {
    await expect(
      channelsCommand.parseAsync(['node', 'test', 'uninstall', 'feishu']),
    ).rejects.toThrow();
  });

  it('enable creates config record', async () => {
    await channelsCommand.parseAsync(['node', 'test', 'enable', 'feishu', '--token', 'abc123']);

    const file = path.join(tempDir, 'channels.json');
    const data = JSON.parse(await fs.readFile(file, 'utf-8'));
    expect(data.configs.length).toBe(1);
    expect(data.configs[0].id).toBe('feishu');
    expect(data.configs[0].enabled).toBe(true);
    expect(data.configs[0].options.token).toBe('abc123');
  });

  it('disable marks config as disabled', async () => {
    await channelsCommand.parseAsync(['node', 'test', 'enable', 'feishu']);
    consoleSpy.mockClear();

    await channelsCommand.parseAsync(['node', 'test', 'disable', 'feishu']);

    const file = path.join(tempDir, 'channels.json');
    const data = JSON.parse(await fs.readFile(file, 'utf-8'));
    expect(data.configs[0].enabled).toBe(false);
    expect(data.configs[0].status).toBe('disabled');
  });

  it('disable non-existing config returns not found message', async () => {
    await channelsCommand.parseAsync(['node', 'test', 'disable', 'feishu']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('未找到'))).toBe(true);
  });

  it('status shows empty list when no configs', async () => {
    await channelsCommand.parseAsync(['node', 'test', 'status']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('暂无已配置通道'))).toBe(true);
  });

  it('status lists configured channels', async () => {
    await channelsCommand.parseAsync(['node', 'test', 'enable', 'feishu']);
    consoleSpy.mockClear();

    await channelsCommand.parseAsync(['node', 'test', 'status']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('已配置通道'))).toBe(true);
    expect(calls.some((line) => line.includes('feishu'))).toBe(true);
    expect(calls.some((line) => line.includes('启用'))).toBe(true);
  });

  it('status with --probe shows reachability', async () => {
    await channelsCommand.parseAsync(['node', 'test', 'enable', 'feishu', '--token', 'my-token']);
    consoleSpy.mockClear();

    await channelsCommand.parseAsync(['node', 'test', 'status', '--probe']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('探测'))).toBe(true);
    expect(calls.some((line) => line.includes('凭据已配置'))).toBe(true);
  });

  it('uninstall installable channel removes config and install record', async () => {
    await channelsCommand.parseAsync(['node', 'test', 'install', 'whatsapp']);
    await channelsCommand.parseAsync(['node', 'test', 'enable', 'whatsapp']);
    consoleSpy.mockClear();

    await channelsCommand.parseAsync(['node', 'test', 'uninstall', 'whatsapp']);

    const file = path.join(tempDir, 'channels.json');
    const data = JSON.parse(await fs.readFile(file, 'utf-8'));
    expect(data.installedIds).not.toContain('whatsapp');
    expect(data.configs.length).toBe(0);
  });
});
