import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigValidator, defaultConfigSchema, validateConfig } from '../config-validator.js';

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator(defaultConfigSchema);
  });

  describe('validate', () => {
    it('空配置应产生 required 错误', () => {
      const result = validator.validate({});
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBeGreaterThan(0);

      const requiredIssues = result.issues.filter((i) => i.code === 'REQUIRED');
      expect(requiredIssues.length).toBeGreaterThan(0);
    });

    it('完整有效配置应通过', () => {
      const config = {
        server: {
          port: 3000,
          host: 'localhost',
        },
        security: {
          apiKey: 'sk-test-key-12345',
        },
      };

      const result = validator.validate(config);
      expect(result.isValid).toBe(true);
      expect(result.errorCount).toBe(0);
    });

    it('端口超出范围应报错', () => {
      const config = {
        server: {
          port: 99999,
          host: 'localhost',
        },
        security: {
          apiKey: 'sk-test-key-12345',
        },
      };

      const result = validator.validate(config);
      expect(result.isValid).toBe(false);
      const maxIssue = result.issues.find((i) => i.code === 'MAX_VALUE');
      expect(maxIssue).toBeDefined();
      expect(maxIssue?.path).toBe('server.port');
    });

    it('端口小于 1 应报错', () => {
      const config = {
        server: {
          port: 0,
          host: 'localhost',
        },
        security: {
          apiKey: 'sk-test-key-12345',
        },
      };

      const result = validator.validate(config);
      expect(result.isValid).toBe(false);
      const minIssue = result.issues.find((i) => i.code === 'MIN_VALUE');
      expect(minIssue).toBeDefined();
    });

    it('类型不匹配应报错', () => {
      const config = {
        server: {
          port: 'not-a-number',
          host: 'localhost',
        },
        security: {
          apiKey: 'sk-test-key-12345',
        },
      };

      const result = validator.validate(config);
      expect(result.isValid).toBe(false);
      const typeIssue = result.issues.find((i) => i.code === 'TYPE_MISMATCH');
      expect(typeIssue).toBeDefined();
    });

    it('枚举值不合法应报错', () => {
      const config = {
        server: {
          port: 3000,
          host: 'localhost',
        },
        security: {
          apiKey: 'sk-test-key-12345',
        },
        logging: {
          level: 'invalid-level',
        },
      };

      const result = validator.validate(config);
      expect(result.isValid).toBe(false);
      const enumIssue = result.issues.find((i) => i.code === 'INVALID_ENUM');
      expect(enumIssue).toBeDefined();
    });

    it('合法枚举值应通过', () => {
      const config = {
        server: {
          port: 3000,
          host: 'localhost',
        },
        security: {
          apiKey: 'sk-test-key-12345',
        },
        logging: {
          level: 'info',
          format: 'json',
        },
      };

      const result = validator.validate(config);
      expect(result.isValid).toBe(true);
    });
  });

  describe('敏感信息检测', () => {
    it('应能识别敏感路径', () => {
      expect(validator.isSensitive('security.apiKey')).toBe(true);
      expect(validator.isSensitive('database.password')).toBe(true);
      expect(validator.isSensitive('ai.apiKey')).toBe(true);
    });

    it('非敏感路径应返回 false', () => {
      expect(validator.isSensitive('server.port')).toBe(false);
      expect(validator.isSensitive('server.host')).toBe(false);
    });

    it('空敏感字段应产生警告', () => {
      const config = {
        server: {
          port: 3000,
          host: 'localhost',
        },
        security: {
          apiKey: '',
        },
      };

      const result = validator.validate(config);
      const emptySecretIssue = result.issues.find((i) => i.code === 'EMPTY_SECRET');
      expect(emptySecretIssue).toBeDefined();
      expect(emptySecretIssue?.severity).toBe('warning');
    });
  });

  describe('generateUiHints', () => {
    it('应生成字段提示', () => {
      const hints = validator.generateUiHints();
      expect(hints.fields.length).toBeGreaterThan(0);
    });

    it('应生成分区提示', () => {
      const hints = validator.generateUiHints();
      expect(hints.sections.length).toBeGreaterThan(0);

      const serverSection = hints.sections.find((s) => s.id === 'server');
      expect(serverSection).toBeDefined();
    });

    it('敏感字段应有 placeholder', () => {
      const hints = validator.generateUiHints();
      const apiKeyField = hints.fields.find((f) => f.path === 'security.apiKey');
      expect(apiKeyField).toBeDefined();
      expect(apiKeyField?.sensitive).toBe(true);
      expect(apiKeyField?.placeholder).toBe('********');
    });

    it('枚举字段应有 options', () => {
      const hints = validator.generateUiHints();
      const levelField = hints.fields.find((f) => f.path === 'logging.level');
      expect(levelField).toBeDefined();
      expect(levelField?.options).toBeDefined();
      expect(levelField?.options?.length).toBeGreaterThan(0);
    });

    it('必填字段应标记 required', () => {
      const hints = validator.generateUiHints();
      const portField = hints.fields.find((f) => f.path === 'server.port');
      expect(portField).toBeDefined();
      expect(portField?.required).toBe(true);
    });

    it('数值字段应有 min/max', () => {
      const hints = validator.generateUiHints();
      const portField = hints.fields.find((f) => f.path === 'server.port');
      expect(portField?.min).toBe(1);
      expect(portField?.max).toBe(65535);
    });
  });

  describe('getSchema', () => {
    it('应返回原始 schema', () => {
      const schema = validator.getSchema();
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(schema.properties.server).toBeDefined();
    });
  });
});

describe('validateConfig 函数', () => {
  it('应能验证有效配置', () => {
    const result = validateConfig({
      server: {
        port: 3000,
        host: 'localhost',
      },
      security: {
        apiKey: 'sk-test-key-12345',
      },
    });

    expect(result.isValid).toBe(true);
  });
});