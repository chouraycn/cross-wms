import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { modelsCommand } from '../models.js';

describe('CLI models command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('has correct command name and description', () => {
    expect(modelsCommand.name()).toBe('models');
    expect(modelsCommand.description()).toContain('模型');
  });

  it('shows help output', () => {
    const helpInformation = modelsCommand.helpInformation();
    expect(helpInformation).toContain('list');
    expect(helpInformation).toContain('default');
    expect(helpInformation).toContain('set-default');
  });

  it('list subcommand outputs model list', async () => {
    await modelsCommand.parseAsync(['node', 'test', 'list']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('可用模型列表'))).toBe(true);
  });

  it('default subcommand outputs default model', async () => {
    await modelsCommand.parseAsync(['node', 'test', 'default']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('默认模型'))).toBe(true);
  });

  // ===================== 边界测试 =====================

  describe('set-default 不存在模型的测试', () => {
    it('set-default 不存在的模型 id 应输出警告但仍写入配置', async () => {
      const originalCwd = process.cwd();
      const os = await import('os');
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'models-setdefault-'));

      try {
        process.chdir(tempDir);

        // 设置一个空的 preset-models.json
        await fs.mkdir(path.join(tempDir, 'shared', 'data'), { recursive: true });
        await fs.writeFile(
          path.join(tempDir, 'shared', 'data', 'preset-models.json'),
          JSON.stringify({ models: [] }),
          'utf-8',
        );

        consoleSpy.mockClear();
        await modelsCommand.parseAsync(['node', 'test', 'set-default', 'non-existent-model-id']);

        const calls = consoleSpy.mock.calls.map((c) => c.map((arg) => String(arg)).join(' '));
        // 应输出警告：模型不在已知列表中
        expect(calls.some((line) => line.includes('警告'))).toBe(true);
        expect(calls.some((line) => line.includes('non-existent-model-id'))).toBe(true);
        // 仍应设置成功
        expect(calls.some((line) => line.includes('默认模型已设置'))).toBe(true);
        // 验证 config.json 被写入
        const configContent = await fs.readFile(
          path.join(tempDir, 'config.json'),
          'utf-8',
        );
        const config = JSON.parse(configContent);
        expect(config.models.default).toBe('non-existent-model-id');
      } finally {
        process.chdir(originalCwd);
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    });

    it('set-default 已知模型 id 时不应输出警告', async () => {
      const originalCwd = process.cwd();
      const os = await import('os');
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'models-known-'));

      try {
        process.chdir(tempDir);

        // 设置包含已知模型的 preset-models.json
        await fs.mkdir(path.join(tempDir, 'shared', 'data'), { recursive: true });
        await fs.writeFile(
          path.join(tempDir, 'shared', 'data', 'preset-models.json'),
          JSON.stringify({
            models: [
              { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
              { id: 'claude-3', name: 'Claude 3', provider: 'anthropic' },
            ],
          }),
          'utf-8',
        );

        consoleSpy.mockClear();
        await modelsCommand.parseAsync(['node', 'test', 'set-default', 'gpt-4o']);

        const calls = consoleSpy.mock.calls.map((c) => c.map((arg) => String(arg)).join(' '));
        // 不应输出警告
        expect(calls.some((line) => line.includes('警告'))).toBe(false);
        // 应设置成功
        expect(calls.some((line) => line.includes('默认模型已设置'))).toBe(true);
        expect(calls.some((line) => line.includes('gpt-4o'))).toBe(true);
      } finally {
        process.chdir(originalCwd);
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    });
  });

  describe('空 list 的测试', () => {
    let originalCwd: string;
    let tempDir: string;

    beforeEach(async () => {
      originalCwd = process.cwd();
      const os = await import('os');
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'models-empty-'));
      process.chdir(tempDir);
    });

    afterEach(async () => {
      process.chdir(originalCwd);
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    it('preset-models.json 不存在时 list 应显示空列表', async () => {
      // 不创建任何 preset-models.json
      consoleSpy.mockClear();
      await modelsCommand.parseAsync(['node', 'test', 'list']);

      const calls = consoleSpy.mock.calls.map((c) => c.map((arg) => String(arg)).join(' '));
      expect(calls.some((line) => line.includes('可用模型列表'))).toBe(true);
      expect(calls.some((line) => line.includes('共 0 个模型'))).toBe(true);
    });

    it('preset-models.json 是空对象时 list 应显示空列表', async () => {
      await fs.mkdir(path.join(tempDir, 'shared', 'data'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'shared', 'data', 'preset-models.json'),
        JSON.stringify({}),
        'utf-8',
      );

      consoleSpy.mockClear();
      await modelsCommand.parseAsync(['node', 'test', 'list']);

      const calls = consoleSpy.mock.calls.map((c) => c.map((arg) => String(arg)).join(' '));
      expect(calls.some((line) => line.includes('可用模型列表'))).toBe(true);
      expect(calls.some((line) => line.includes('共 0 个模型'))).toBe(true);
    });

    it('preset-models.json 中 models 为空数组时 list 应显示空列表', async () => {
      await fs.mkdir(path.join(tempDir, 'shared', 'data'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'shared', 'data', 'preset-models.json'),
        JSON.stringify({ models: [] }),
        'utf-8',
      );

      consoleSpy.mockClear();
      await modelsCommand.parseAsync(['node', 'test', 'list']);

      const calls = consoleSpy.mock.calls.map((c) => c.map((arg) => String(arg)).join(' '));
      expect(calls.some((line) => line.includes('可用模型列表'))).toBe(true);
      expect(calls.some((line) => line.includes('共 0 个模型'))).toBe(true);
    });

    it('preset-models.json 中包含模型时 list 应正确显示', async () => {
      await fs.mkdir(path.join(tempDir, 'shared', 'data'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'shared', 'data', 'preset-models.json'),
        JSON.stringify({
          models: [
            {
              id: 'test-model',
              name: '测试模型',
              provider: 'test',
              description: '边界测试',
              capabilities: ['chat', 'code'],
              contextWindow: 128000,
            },
          ],
        }),
        'utf-8',
      );

      consoleSpy.mockClear();
      await modelsCommand.parseAsync(['node', 'test', 'list']);

      const calls = consoleSpy.mock.calls.map((c) => c.map((arg) => String(arg)).join(' '));
      expect(calls.some((line) => line.includes('test-model'))).toBe(true);
      expect(calls.some((line) => line.includes('测试模型'))).toBe(true);
      expect(calls.some((line) => line.includes('边界测试'))).toBe(true);
      expect(calls.some((line) => line.includes('共 1 个模型'))).toBe(true);
    });

    it('config.json 不存在时 default 应回退到 gpt-4o 或环境变量', async () => {
      // 不创建 config.json
      consoleSpy.mockClear();
      await modelsCommand.parseAsync(['node', 'test', 'default']);

      const calls = consoleSpy.mock.calls.map((c) => c.map((arg) => String(arg)).join(' '));
      expect(calls.some((line) => line.includes('默认模型'))).toBe(true);
    });
  });
});
