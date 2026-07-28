import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { clawbotCommand } from '../clawbot.js';

describe('CLI clawbot command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let tempDir: string;
  let originalStateDir: string | undefined;

  beforeEach(async () => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clawbot-test-'));
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
    expect(clawbotCommand.name()).toBe('clawbot');
    expect(clawbotCommand.description()).toContain('AI 对话');
  });

  it('shows help output with all subcommands', () => {
    const help = clawbotCommand.helpInformation();
    expect(help).toContain('chat');
    expect(help).toContain('history');
    expect(help).toContain('list');
    expect(help).toContain('clear');
  });

  it('list shows empty when no sessions exist', async () => {
    await clawbotCommand.parseAsync(['node', 'test', 'list']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('暂无会话'))).toBe(true);
  });

  it('chat creates session and stores history', async () => {
    await clawbotCommand.parseAsync(['node', 'test', 'chat', 'hello world']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    // 模拟回复应被输出
    expect(calls.some((line) => line.includes('hello world'))).toBe(true);

    // 验证持久化文件
    const historyFile = path.join(tempDir, 'clawbot-history.json');
    const content = await fs.readFile(historyFile, 'utf-8');
    const data = JSON.parse(content);
    expect(data.sessions.length).toBe(1);
    expect(data.sessions[0].messages.length).toBe(2);
    expect(data.sessions[0].messages[0].role).toBe('user');
    expect(data.sessions[0].messages[1].role).toBe('assistant');
  });

  it('chat with empty message throws', async () => {
    await expect(
      clawbotCommand.parseAsync(['node', 'test', 'chat', '   ']),
    ).rejects.toThrow();
  });

  it('list shows existing sessions after chat', async () => {
    await clawbotCommand.parseAsync(['node', 'test', 'chat', 'first message']);
    consoleSpy.mockClear();

    await clawbotCommand.parseAsync(['node', 'test', 'list']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('会话列表'))).toBe(true);
    expect(calls.some((line) => line.includes('共 1 个'))).toBe(true);
  });

  it('history shows messages for a session', async () => {
    await clawbotCommand.parseAsync(['node', 'test', 'chat', 'remember this']);
    consoleSpy.mockClear();

    // 读取 history 获取 session id
    const historyFile = path.join(tempDir, 'clawbot-history.json');
    const data = JSON.parse(await fs.readFile(historyFile, 'utf-8'));
    const sessionId = data.sessions[0].id;

    await clawbotCommand.parseAsync(['node', 'test', 'history', sessionId]);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('remember this'))).toBe(true);
    expect(calls.some((line) => line.includes('user'))).toBe(true);
  });

  it('history for unknown session shows empty', async () => {
    await clawbotCommand.parseAsync(['node', 'test', 'history', 'unknown-session']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('暂无消息'))).toBe(true);
  });

  it('clear removes messages', async () => {
    await clawbotCommand.parseAsync(['node', 'test', 'chat', 'to be cleared']);
    consoleSpy.mockClear();

    await clawbotCommand.parseAsync(['node', 'test', 'clear']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('已清空'))).toBe(true);

    // 验证消息已被清空
    const data = JSON.parse(await fs.readFile(path.join(tempDir, 'clawbot-history.json'), 'utf-8'));
    expect(data.sessions[0].messages.length).toBe(0);
  });

  it('clear with specific sessionId clears that session only', async () => {
    // 创建第一个会话（使用显式 sessionId）
    await clawbotCommand.parseAsync(['node', 'test', 'chat', 'first', '-s', 'session-A']);
    // 创建第二个会话
    await clawbotCommand.parseAsync(['node', 'test', 'chat', 'second', '-s', 'session-B']);
    consoleSpy.mockClear();

    await clawbotCommand.parseAsync(['node', 'test', 'clear', 'session-A']);

    const historyFile = path.join(tempDir, 'clawbot-history.json');
    const updated = JSON.parse(await fs.readFile(historyFile, 'utf-8'));
    const sessionA = updated.sessions.find((s: { id: string }) => s.id === 'session-A');
    const sessionB = updated.sessions.find((s: { id: string }) => s.id === 'session-B');
    expect(sessionA.messages.length).toBe(0);
    expect(sessionB.messages.length).toBe(2);
  });
});
