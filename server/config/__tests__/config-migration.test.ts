import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConfigMigrationManager,
  CURRENT_CONFIG_VERSION,
  type AppConfig,
  type MigrationDefinition,
} from '../config-migration.js';

describe('ConfigMigrationManager', () => {
  let manager: ConfigMigrationManager;

  beforeEach(() => {
    manager = new ConfigMigrationManager();
  });

  function registerBasicMigrations() {
    const v1ToV2: MigrationDefinition = {
      fromVersion: 1,
      toVersion: 2,
      name: 'v1-to-v2',
      migrate: (config) => ({ ...config, addedInV2: true }),
      rollback: (config) => {
        const next = { ...config };
        delete next.addedInV2;
        return next;
      },
    };
    const v2ToV3: MigrationDefinition = {
      fromVersion: 2,
      toVersion: 3,
      name: 'v2-to-v3',
      migrate: (config) => ({ ...config, addedInV3: true }),
      rollback: (config) => {
        const next = { ...config };
        delete next.addedInV3;
        return next;
      },
    };
    const v3ToV4: MigrationDefinition = {
      fromVersion: 3,
      toVersion: 4,
      name: 'v3-to-v4',
      migrate: (config) => ({ ...config, addedInV4: true }),
      rollback: (config) => {
        const next = { ...config };
        delete next.addedInV4;
        return next;
      },
    };
    manager.registerMigration(v1ToV2);
    manager.registerMigration(v2ToV3);
    manager.registerMigration(v3ToV4);
  }

  describe('registerMigration / listMigrations', () => {
    it('应允许注册迁移', () => {
      registerBasicMigrations();
      const list = manager.listMigrations();
      expect(list.length).toBe(3);
    });

    it('重复注册应抛出错误', () => {
      const m: MigrationDefinition = {
        fromVersion: 1,
        toVersion: 2,
        name: 'dup',
        migrate: (c) => c,
      };
      manager.registerMigration(m);
      expect(() => manager.registerMigration(m)).toThrow();
    });

    it('listMigrations 应按版本升序排列', () => {
      // 故意乱序注册
      manager.registerMigration({ fromVersion: 3, toVersion: 4, name: 'm3', migrate: (c) => c });
      manager.registerMigration({ fromVersion: 1, toVersion: 2, name: 'm1', migrate: (c) => c });
      manager.registerMigration({ fromVersion: 2, toVersion: 3, name: 'm2', migrate: (c) => c });

      const list = manager.listMigrations();
      expect(list.map((m) => m.name)).toEqual(['m1', 'm2', 'm3']);
    });
  });

  describe('getConfigVersion', () => {
    it('应返回 config.configVersion', () => {
      expect(manager.getConfigVersion({ configVersion: 3 })).toBe(3);
    });

    it('无 configVersion 字段时应返回 1', () => {
      expect(manager.getConfigVersion({})).toBe(1);
    });

    it('非数字时应返回 1', () => {
      expect(manager.getConfigVersion({ configVersion: 'invalid' })).toBe(1);
    });

    it('负数或非整数应返回 1', () => {
      expect(manager.getConfigVersion({ configVersion: -1 })).toBe(1);
      expect(manager.getConfigVersion({ configVersion: 1.5 })).toBe(1);
    });
  });

  describe('migrate', () => {
    beforeEach(() => {
      registerBasicMigrations();
    });

    it('应按顺序应用多个迁移', async () => {
      const config: AppConfig = { configVersion: 1, original: true };
      const result = await manager.migrate(config, 4);

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe(1);
      expect(result.toVersion).toBe(4);
      expect(result.appliedMigrations).toEqual(['v1-to-v2', 'v2-to-v3', 'v3-to-v4']);
      expect(result.migratedConfig.addedInV2).toBe(true);
      expect(result.migratedConfig.addedInV3).toBe(true);
      expect(result.migratedConfig.addedInV4).toBe(true);
      expect(result.migratedConfig.original).toBe(true); // 原字段应保留
      expect(result.migratedConfig.configVersion).toBe(4);
    });

    it('已是目标版本时应跳过迁移', async () => {
      const config: AppConfig = { configVersion: 3, addedInV3: true };
      const result = await manager.migrate(config, 3);

      expect(result.success).toBe(true);
      expect(result.appliedMigrations).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('force=true 时即使版本相同也尝试迁移', async () => {
      const config: AppConfig = { configVersion: 3, addedInV3: true };
      const result = await manager.migrate(config, 3, { force: true });

      expect(result.success).toBe(true);
      // 即使版本相同，仍会执行路径上的迁移
    });

    it('dryRun 应跳过实际应用', async () => {
      const config: AppConfig = { configVersion: 1 };
      const result = await manager.migrate(config, 4, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.appliedMigrations).toHaveLength(0);
      expect(result.skippedMigrations).toEqual(['v1-to-v2', 'v2-to-v3', 'v3-to-v4']);
      // 配置未被修改
      expect(result.migratedConfig.addedInV2).toBeUndefined();
    });

    it('降级应失败', async () => {
      const config: AppConfig = { configVersion: 4 };
      const result = await manager.migrate(config, 2);

      expect(result.success).toBe(false);
      expect(result.error).toContain('downgrade');
    });

    it('无迁移路径应失败', async () => {
      // 没有注册 v4->v5
      const config: AppConfig = { configVersion: 4 };
      const result = await manager.migrate(config, 5);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No migration path');
    });

    it('迁移函数抛出异常应中断并返回错误', async () => {
      manager.registerMigration({
        fromVersion: 4,
        toVersion: 5,
        name: 'failing-migration',
        migrate: () => {
          throw new Error('intentional failure');
        },
      });

      const config: AppConfig = { configVersion: 4 };
      const result = await manager.migrate(config, 5);

      expect(result.success).toBe(false);
      expect(result.error).toBe('intentional failure');
      expect(result.appliedMigrations).toHaveLength(0);
    });

    it('应支持异步迁移函数', async () => {
      manager.registerMigration({
        fromVersion: 4,
        toVersion: 5,
        name: 'async-migration',
        migrate: async (config) => {
          await new Promise((r) => setTimeout(r, 10));
          return { ...config, asyncMigrated: true };
        },
      });

      const config: AppConfig = { configVersion: 4 };
      const result = await manager.migrate(config, 5);

      expect(result.success).toBe(true);
      expect(result.migratedConfig.asyncMigrated).toBe(true);
    });

    it('logs 应记录迁移过程', async () => {
      const config: AppConfig = { configVersion: 1 };
      const result = await manager.migrate(config, 3);

      expect(result.logs.length).toBeGreaterThan(0);
      expect(result.logs[0].message).toContain('Starting migration');
      expect(result.logs.some((l) => l.message.includes('v1-to-v2'))).toBe(true);
    });
  });

  describe('rollback', () => {
    beforeEach(() => {
      registerBasicMigrations();
    });

    it('应回滚到指定版本', async () => {
      const config: AppConfig = {
        configVersion: 4,
        addedInV2: true,
        addedInV3: true,
        addedInV4: true,
      };
      const result = await manager.rollback(config, 2);

      expect(result.success).toBe(true);
      expect(result.appliedMigrations).toEqual(['v3-to-v4', 'v2-to-v3']);
      expect(result.migratedConfig.addedInV4).toBeUndefined();
      expect(result.migratedConfig.addedInV3).toBeUndefined();
      expect(result.migratedConfig.addedInV2).toBe(true);
      expect(result.migratedConfig.configVersion).toBe(2);
    });

    it('回滚到当前版本应为空操作', async () => {
      const config: AppConfig = { configVersion: 3 };
      const result = await manager.rollback(config, 3);
      expect(result.success).toBe(true);
      expect(result.appliedMigrations).toHaveLength(0);
    });

    it('回滚到更高版本应失败', async () => {
      const config: AppConfig = { configVersion: 2 };
      const result = await manager.rollback(config, 4);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot rollback to a higher version');
    });

    it('迁移未提供 rollback 应失败', async () => {
      manager.registerMigration({
        fromVersion: 4,
        toVersion: 5,
        name: 'no-rollback',
        migrate: (c) => c,
        // 没有 rollback
      });
      const config: AppConfig = { configVersion: 5 };
      const result = await manager.rollback(config, 4);
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not support rollback');
    });

    it('dryRun 应跳过回滚应用', async () => {
      const config: AppConfig = { configVersion: 4, addedInV4: true };
      const result = await manager.rollback(config, 3, { dryRun: true });
      expect(result.success).toBe(true);
      expect(result.appliedMigrations).toHaveLength(0);
      expect(result.skippedMigrations).toEqual(['v3-to-v4']);
      expect(result.migratedConfig.addedInV4).toBe(true); // 未被回滚
    });
  });

  describe('验证器', () => {
    it('应运行注册的验证器', async () => {
      registerBasicMigrations();
      manager.registerValidator((config) => {
        const errors: string[] = [];
        if (!config.server) {
          errors.push('server field missing');
        }
        return { valid: errors.length === 0, errors };
      });

      const config: AppConfig = { configVersion: 1 };
      const result = await manager.migrate(config, 4);

      expect(result.success).toBe(true);
      // 验证错误应记录在 logs 中
      expect(result.logs.some((l) => l.message.includes('server field missing'))).toBe(true);
    });
  });

  describe('内置迁移', () => {
    it('CURRENT_CONFIG_VERSION 应为 3', () => {
      expect(CURRENT_CONFIG_VERSION).toBe(3);
    });

    it('v1->v2 迁移：port 应迁移到 server.port', async () => {
      // 使用全局默认实例（已注册内置迁移）
      const { configMigrationManager } = await import('../config-migration.js');
      const config: AppConfig = {
        configVersion: 1,
        port: 3000,
      };
      const result = await configMigrationManager.migrate(config, 2);

      expect(result.success).toBe(true);
      expect(result.migratedConfig.port).toBeUndefined();
      expect((result.migratedConfig.server as Record<string, unknown>)?.port).toBe(3000);
      expect((result.migratedConfig.logging as Record<string, unknown>)?.level).toBe('info');
    });

    it('v2->v3 迁移：apiKey 应迁移到 ai.providers.openai.apiKey', async () => {
      const { configMigrationManager } = await import('../config-migration.js');
      const config: AppConfig = {
        configVersion: 2,
        apiKey: 'sk-xxx',
      };
      const result = await configMigrationManager.migrate(config, 3);

      expect(result.success).toBe(true);
      expect(result.migratedConfig.apiKey).toBeUndefined();
      const ai = result.migratedConfig.ai as Record<string, unknown>;
      expect(ai.defaultModel).toBe('gpt-4o-mini');
      const providers = ai.providers as Record<string, unknown>;
      const openai = providers.openai as Record<string, unknown>;
      expect(openai.apiKey).toBe('sk-xxx');
    });

    it('v1->v3 完整迁移应依次应用两个迁移', async () => {
      const { configMigrationManager } = await import('../config-migration.js');
      const config: AppConfig = {
        configVersion: 1,
        port: 8080,
        apiKey: 'sk-test',
      };
      const result = await configMigrationManager.migrate(config, 3);

      expect(result.success).toBe(true);
      expect(result.appliedMigrations).toEqual(['restructure-server-config', 'restructure-ai-config']);
      const migrated = result.migratedConfig;
      expect((migrated.server as Record<string, unknown>)?.port).toBe(8080);
      expect((migrated.logging as Record<string, unknown>)?.level).toBe('info');
      const ai = migrated.ai as Record<string, unknown>;
      expect(ai.defaultModel).toBe('gpt-4o-mini');
      const openai = (ai.providers as Record<string, unknown>)?.openai as Record<string, unknown>;
      expect(openai.apiKey).toBe('sk-test');
      expect(migrated.configVersion).toBe(3);
    });

    it('v3->v1 完整回滚应能恢复原始结构', async () => {
      const { configMigrationManager } = await import('../config-migration.js');
      const v3Config: AppConfig = {
        configVersion: 3,
        server: { port: 8080 },
        logging: { level: 'info' },
        ai: {
          defaultModel: 'gpt-4o-mini',
          providers: { openai: { apiKey: 'sk-test' } },
        },
      };
      const result = await configMigrationManager.rollback(v3Config, 1);

      expect(result.success).toBe(true);
      expect(result.appliedMigrations).toEqual(['restructure-ai-config', 'restructure-server-config']);
      expect(result.migratedConfig.port).toBe(8080);
      expect(result.migratedConfig.apiKey).toBe('sk-test');
      expect(result.migratedConfig.configVersion).toBe(1);
    });
  });

  describe('边界情况', () => {
    it('空配置应能迁移', async () => {
      registerBasicMigrations();
      const config: AppConfig = {};
      // 默认版本为 1
      const result = await manager.migrate(config, 4);
      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe(1);
    });

    it('同版本的 force 迁移应正确执行', async () => {
      registerBasicMigrations();
      const config: AppConfig = { configVersion: 3, addedInV3: true };
      const result = await manager.migrate(config, 3, { force: true });
      expect(result.success).toBe(true);
    });
  });
});
