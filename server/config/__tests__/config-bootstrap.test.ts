import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  loadConfigFile,
  writeConfigFile,
  backupConfig,
  pruneBackups,
  bootstrapConfig,
} from '../config-bootstrap.js';
import { CURRENT_CONFIG_VERSION } from '../config-migration.js';

describe('config-bootstrap', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgboot-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadConfigFile', () => {
    it('文件不存在时应返回空对象', () => {
      const result = loadConfigFile(path.join(tmpDir, 'missing.json'));
      expect(result).toEqual({});
    });

    it('应能加载合法 JSON 配置', () => {
      const p = path.join(tmpDir, 'config.json');
      fs.writeFileSync(p, JSON.stringify({ foo: 'bar', n: 42 }), 'utf-8');
      const result = loadConfigFile(p);
      expect(result.foo).toBe('bar');
      expect(result.n).toBe(42);
    });

    it('JSON 解析失败时应返回空对象', () => {
      const p = path.join(tmpDir, 'bad.json');
      fs.writeFileSync(p, '{ not valid json', 'utf-8');
      const result = loadConfigFile(p);
      expect(result).toEqual({});
    });
  });

  describe('writeConfigFile', () => {
    it('应能写入配置文件', () => {
      const p = path.join(tmpDir, 'sub', 'config.json');
      writeConfigFile(p, { hello: 'world' });
      const content = fs.readFileSync(p, 'utf-8');
      expect(JSON.parse(content).hello).toBe('world');
    });

    it('应能覆盖已存在的配置文件', () => {
      const p = path.join(tmpDir, 'config.json');
      fs.writeFileSync(p, '{"old":true}', 'utf-8');
      writeConfigFile(p, { new: true });
      const content = fs.readFileSync(p, 'utf-8');
      expect(JSON.parse(content)).toEqual({ new: true });
    });
  });

  describe('backupConfig', () => {
    it('文件存在时应创建备份', () => {
      const p = path.join(tmpDir, 'config.json');
      fs.writeFileSync(p, '{"v":1}', 'utf-8');
      const backupPath = backupConfig(p, tmpDir);
      expect(backupPath).toBeDefined();
      expect(fs.existsSync(backupPath!)).toBe(true);
      expect(fs.readFileSync(backupPath!, 'utf-8')).toBe('{"v":1}');
    });

    it('文件不存在时应返回 undefined', () => {
      const p = path.join(tmpDir, 'missing.json');
      const backupPath = backupConfig(p, tmpDir);
      expect(backupPath).toBeUndefined();
    });
  });

  describe('pruneBackups', () => {
    it('应保留最近 N 个备份，删除其余', () => {
      const p = path.join(tmpDir, 'config.json');
      // 创建 5 个备份文件（带不同 mtime）
      for (let i = 0; i < 5; i++) {
        const backupPath = path.join(tmpDir, `config.backup-2026-01-0${i + 1}.json`);
        fs.writeFileSync(backupPath, '{}', 'utf-8');
        // 设置不同的修改时间，确保排序稳定
        const mtime = new Date(2026, 0, i + 1).getTime() / 1000;
        fs.utimesSync(backupPath, mtime, mtime);
      }
      const pruned = pruneBackups(p, 2);
      expect(pruned).toBe(3);
      const remaining = fs.readdirSync(tmpDir).filter((f) => f.includes('backup'));
      expect(remaining.length).toBe(2);
    });

    it('目录不存在时应返回 0', () => {
      const pruned = pruneBackups(path.join(tmpDir, 'missing', 'config.json'), 5);
      expect(pruned).toBe(0);
    });
  });

  describe('bootstrapConfig', () => {
    it('已是当前版本时无需迁移', async () => {
      const p = path.join(tmpDir, 'config.json');
      const config = {
        configVersion: CURRENT_CONFIG_VERSION,
        server: { port: 3000, host: 'localhost' },
        security: { apiKey: 'secret-key' },
      };
      writeConfigFile(p, config);

      const result = await bootstrapConfig({ configPath: p });
      expect(result.success).toBe(true);
      expect(result.migration?.appliedMigrations).toHaveLength(0);
      expect(result.persisted).toBe(false);
      expect(result.validation.errorCount).toBe(0);
    });

    it('旧版本配置应自动迁移并持久化', async () => {
      const p = path.join(tmpDir, 'config.json');
      // v1 配置：缺少 configVersion 或 configVersion=1，触发 v1→v2→v3 迁移
      const v1Config = {
        configVersion: 1,
        port: 3000,
        server: { host: 'localhost' },
        security: { apiKey: 'topsecret' },
      };
      writeConfigFile(p, v1Config);

      const result = await bootstrapConfig({ configPath: p, createBackup: false });
      expect(result.success).toBe(true);
      expect(result.migration?.appliedMigrations.length).toBeGreaterThan(0);
      expect(result.persisted).toBe(true);
      expect(result.config.configVersion).toBe(CURRENT_CONFIG_VERSION);

      // 验证磁盘已被更新
      const onDisk = JSON.parse(fs.readFileSync(p, 'utf-8'));
      expect(onDisk.configVersion).toBe(CURRENT_CONFIG_VERSION);
    });

    it('禁用 persistAfterMigrate 时不应写回磁盘', async () => {
      const p = path.join(tmpDir, 'config.json');
      const originalContent = {
        configVersion: 1,
        port: 3000,
        server: { host: 'localhost' },
        security: { apiKey: 'topsecret' },
      };
      writeConfigFile(p, originalContent);

      const result = await bootstrapConfig({
        configPath: p,
        persistAfterMigrate: false,
        createBackup: false,
      });
      expect(result.success).toBe(true);
      expect(result.persisted).toBe(false);

      // 磁盘上仍是原内容
      const onDisk = JSON.parse(fs.readFileSync(p, 'utf-8'));
      expect(onDisk.configVersion).toBe(1);
    });

    it('校验失败时应拒绝并返回 error', async () => {
      const p = path.join(tmpDir, 'config.json');
      // 缺少必需的 server / security
      writeConfigFile(p, { configVersion: CURRENT_CONFIG_VERSION });

      const result = await bootstrapConfig({ configPath: p, createBackup: false });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Config validation failed');
      expect(result.validation.errorCount).toBeGreaterThan(0);
      expect(result.persisted).toBe(false);
    });

    it('failOnError=false 时即使有校验错误也返回 success', async () => {
      const p = path.join(tmpDir, 'config.json');
      writeConfigFile(p, { configVersion: CURRENT_CONFIG_VERSION });

      const result = await bootstrapConfig({
        configPath: p,
        failOnError: false,
        createBackup: false,
      });
      expect(result.success).toBe(true);
      expect(result.validation.errorCount).toBeGreaterThan(0);
    });

    it('迁移失败且启用 rollbackOnFailure 时应回滚', async () => {
      const p = path.join(tmpDir, 'config.json');
      // v999 远高于 CURRENT_CONFIG_VERSION，触发 "Cannot downgrade" 错误
      const v999Config = {
        configVersion: 999,
        server: { port: 3000, host: 'localhost' },
        security: { apiKey: 'topsecret' },
      };
      writeConfigFile(p, v999Config);

      const result = await bootstrapConfig({ configPath: p, createBackup: false });
      expect(result.success).toBe(false);
      expect(result.error).toContain('migration failed');
      // 回滚后 config 应该恢复到原始内容
      expect(result.config.configVersion).toBe(999);
    });

    it('迁移失败且禁用 rollbackOnFailure 时应保留迁移后配置', async () => {
      const p = path.join(tmpDir, 'config.json');
      const v999Config = {
        configVersion: 999,
        server: { port: 3000, host: 'localhost' },
        security: { apiKey: 'topsecret' },
      };
      writeConfigFile(p, v999Config);

      const result = await bootstrapConfig({
        configPath: p,
        rollbackOnFailure: false,
        createBackup: false,
      });
      expect(result.success).toBe(false);
      // 不回滚，保留迁移结果（此时为迁移失败的中间状态）
      expect(result.migration).toBeDefined();
    });

    it('启用 createBackup 时应创建备份文件', async () => {
      const p = path.join(tmpDir, 'config.json');
      writeConfigFile(p, {
        configVersion: 1,
        port: 3000,
        server: { host: 'localhost' },
        security: { apiKey: 'topsecret' },
      });

      await bootstrapConfig({ configPath: p, createBackup: true });
      const backups = fs.readdirSync(tmpDir).filter((f) => f.includes('backup'));
      expect(backups.length).toBe(1);
    });

    it('不存在的配置文件应视为空配置并校验失败', async () => {
      const p = path.join(tmpDir, 'missing.json');
      const result = await bootstrapConfig({ configPath: p, createBackup: false });
      expect(result.success).toBe(false);
      expect(result.validation.errorCount).toBeGreaterThan(0);
    });
  });
});
