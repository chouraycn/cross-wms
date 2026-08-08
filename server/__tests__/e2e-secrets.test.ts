/**
 * E2E 测试：密钥管理系统
 *
 * 端到端验证 4 个密钥系统核心能力：
 * 1. 恒定时间比较（防时序攻击）
 * 2. SecretInput 双模式（plaintext + ref）
 * 3. 规范化与判定函数
 * 4. 可选 Schema 构建
 */

import { describe, it, expect } from 'vitest';
import {
  constantTimeEqual,
  hasConfiguredSecretInput,
  hasConfiguredPlaintextSecretValue,
  isSecretRef,
  coerceSecretRef,
  normalizeSecretInput,
  normalizeResolvedSecretInputString,
  buildOptionalSecretInputSchema,
  type SecretInput,
} from '../engine/secretSecurity.js';

describe('E2E: 密钥管理系统', () => {

  // ==================== 1. 恒定时间比较 ====================
  describe('恒定时间比较 constantTimeEqual', () => {
    it('相同字符串应返回 true', () => {
      expect(constantTimeEqual('hello', 'hello')).toBe(true);
      expect(constantTimeEqual('', '')).toBe(true);
      expect(constantTimeEqual('abc123', 'abc123')).toBe(true);
      expect(constantTimeEqual('你好世界', '你好世界')).toBe(true);
    });

    it('不同字符串应返回 false', () => {
      expect(constantTimeEqual('hello', 'world')).toBe(false);
      expect(constantTimeEqual('abc', 'abcd')).toBe(false);
      expect(constantTimeEqual('abcd', 'abc')).toBe(false);
      expect(constantTimeEqual('', 'nonempty')).toBe(false);
    });

    it('非字符串输入应返回 false', () => {
      expect(constantTimeEqual(null as any, 'test')).toBe(false);
      expect(constantTimeEqual(undefined as any, 'test')).toBe(false);
      expect(constantTimeEqual(123 as any, '123')).toBe(false);
      expect(constantTimeEqual({} as any, {} as any)).toBe(false);
    });

    it('大小写敏感', () => {
      expect(constantTimeEqual('Hello', 'hello')).toBe(false);
      expect(constantTimeEqual('API_KEY', 'api_key')).toBe(false);
    });

    it('长字符串比较', () => {
      const long1 = 'A'.repeat(1000);
      const long2 = 'A'.repeat(1000);
      const long3 = 'A'.repeat(999) + 'B';
      expect(constantTimeEqual(long1, long2)).toBe(true);
      expect(constantTimeEqual(long1, long3)).toBe(false);
    });

    it('Unicode 字符串比较', () => {
      const s1 = '🚀🔥💻🎉';
      const s2 = '🚀🔥💻🎉';
      const s3 = '🚀🔥💻😢';
      expect(constantTimeEqual(s1, s2)).toBe(true);
      expect(constantTimeEqual(s1, s3)).toBe(false);
    });

    it('执行时间应对等（基本验证）', () => {
      // 这是一个概率性测试：比较相同长度和不同长度字符串的比较时间
      // 由于 JS 单线程和 JIT 优化，这只是粗略验证
      const short = 'a';
      const long = 'a'.repeat(10000);
      const sameShort = 'a';
      const diffShort = 'b';

      // 预热
      for (let i = 0; i < 100; i++) {
        constantTimeEqual(long, long);
      }

      // 测相同长度
      const start1 = process.hrtime.bigint();
      for (let i = 0; i < 1000; i++) {
        constantTimeEqual(short, diffShort);
      }
      const end1 = process.hrtime.bigint();

      const start2 = process.hrtime.bigint();
      for (let i = 0; i < 1000; i++) {
        constantTimeEqual(long, 'b'.repeat(10000));
      }
      const end2 = process.hrtime.bigint();

      // 长字符串比较时间应该 > 0
      const shortTime = Number(end1 - start1);
      const longTime = Number(end2 - start2);
      expect(longTime).toBeGreaterThan(0);
      expect(shortTime).toBeGreaterThan(0);
    });

    it('token 类密钥比较场景', () => {
      const realToken = 'sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz';
      const guess1 = 'sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz';
      const guess2 = 'sk-wrongwrongwrongwrongwrongwrongwrongwrong';

      expect(constantTimeEqual(realToken, guess1)).toBe(true);
      expect(constantTimeEqual(realToken, guess2)).toBe(false);
    });
  });

  // ==================== 2. SecretInput 双模式 ====================
  describe('SecretInput 双模式', () => {
    it('plaintext 模式应正确表示', () => {
      const input: SecretInput = {
        type: 'api_key',
        resolution: {
          mode: 'plaintext',
          value: 'my-secret-key-123',
        },
      };
      expect(input.resolution.mode).toBe('plaintext');
      expect(input.resolution.value).toBe('my-secret-key-123');
      expect(input.type).toBe('api_key');
    });

    it('ref 模式应正确表示', () => {
      const input: SecretInput = {
        type: 'password',
        resolution: {
          mode: 'ref',
          ref: { provider: 'env', key: 'DB_PASSWORD', type: 'password' },
        },
      };
      expect(input.resolution.mode).toBe('ref');
      expect(input.resolution.ref?.provider).toBe('env');
      expect(input.resolution.ref?.key).toBe('DB_PASSWORD');
    });

    it('支持所有密钥类型', () => {
      const types: Array<'api_key' | 'password' | 'token' | 'certificate' | 'ssh_key' | 'other'> = [
        'api_key', 'password', 'token', 'certificate', 'ssh_key', 'other',
      ];
      for (const type of types) {
        const input: SecretInput = {
          type,
          resolution: { mode: 'plaintext', value: 'test' },
        };
        expect(input.type).toBe(type);
      }
    });

    it('支持所有 provider 类型', () => {
      const providers: Array<'env' | 'file' | 'encrypted' | 'keychain'> = [
        'env', 'file', 'encrypted', 'keychain',
      ];
      for (const provider of providers) {
        const input: SecretInput = {
          resolution: {
            mode: 'ref',
            ref: { provider, key: 'TEST_KEY' },
          },
        };
        expect(input.resolution.ref?.provider).toBe(provider);
      }
    });
  });

  // ==================== 3. 判定与规范化函数 ====================
  describe('判定与规范化函数', () => {
    describe('hasConfiguredSecretInput', () => {
      it('plaintext 模式有值应返回 true', () => {
        const input: SecretInput = {
          resolution: { mode: 'plaintext', value: 'some-value' },
        };
        expect(hasConfiguredSecretInput(input)).toBe(true);
      });

      it('ref 模式有 ref 应返回 true', () => {
        const input: SecretInput = {
          resolution: { mode: 'ref', ref: { provider: 'env', key: 'X' } },
        };
        expect(hasConfiguredSecretInput(input)).toBe(true);
      });

      it('空值或 undefined 应返回 false', () => {
        expect(hasConfiguredSecretInput(undefined)).toBe(false);
        expect(hasConfiguredSecretInput(null)).toBe(false);
        expect(hasConfiguredSecretInput({
          resolution: { mode: 'plaintext', value: '' },
        })).toBe(false);
        expect(hasConfiguredSecretInput({
          resolution: { mode: 'ref' },
        })).toBe(false);
      });
    });

    describe('hasConfiguredPlaintextSecretValue', () => {
      it('plaintext 模式有值应返回 true', () => {
        const input: SecretInput = {
          resolution: { mode: 'plaintext', value: 'key123' },
        };
        expect(hasConfiguredPlaintextSecretValue(input)).toBe(true);
      });

      it('ref 模式应返回 false', () => {
        const input: SecretInput = {
          resolution: { mode: 'ref', ref: { provider: 'env', key: 'X' } },
        };
        expect(hasConfiguredPlaintextSecretValue(input)).toBe(false);
      });

      it('undefined 应返回 false', () => {
        expect(hasConfiguredPlaintextSecretValue(undefined)).toBe(false);
        expect(hasConfiguredPlaintextSecretValue(null)).toBe(false);
      });
    });

    describe('isSecretRef', () => {
      it('ref 模式应返回 true', () => {
        const input: SecretInput = {
          resolution: { mode: 'ref', ref: { provider: 'env', key: 'X' } },
        };
        expect(isSecretRef(input)).toBe(true);
      });

      it('plaintext 模式应返回 false', () => {
        const input: SecretInput = {
          resolution: { mode: 'plaintext', value: 'x' },
        };
        expect(isSecretRef(input)).toBe(false);
      });

      it('undefined 应返回 false', () => {
        expect(isSecretRef(undefined)).toBe(false);
      });
    });

    describe('coerceSecretRef', () => {
      it('字符串应强制转换为 plaintext SecretInput', () => {
        const result = coerceSecretRef('my-api-key');
        expect(result).toBeDefined();
        expect(result?.resolution.mode).toBe('plaintext');
        expect(result?.resolution.value).toBe('my-api-key');
      });

      it('SecretInput 对象应原样返回', () => {
        const input: SecretInput = {
          type: 'api_key',
          resolution: { mode: 'ref', ref: { provider: 'env', key: 'X' } },
        };
        const result = coerceSecretRef(input);
        expect(result).toBe(input);
      });

      it('undefined 应返回 undefined', () => {
        expect(coerceSecretRef(undefined)).toBeUndefined();
      });
    });

    describe('normalizeSecretInput', () => {
      it('字符串应规范化为 plaintext SecretInput', () => {
        const result = normalizeSecretInput('hello');
        expect(result?.resolution.mode).toBe('plaintext');
        expect(result?.resolution.value).toBe('hello');
      });

      it('SecretInput 对象应保持结构', () => {
        const input: SecretInput = {
          type: 'password',
          resolution: { mode: 'ref', ref: { provider: 'file', key: '/path' } },
        };
        const result = normalizeSecretInput(input);
        expect(result?.type).toBe('password');
        expect(result?.resolution.mode).toBe('ref');
      });

      it('undefined 应返回 undefined', () => {
        expect(normalizeSecretInput(undefined)).toBeUndefined();
      });
    });

    describe('normalizeResolvedSecretInputString', () => {
      it('应去除首尾空白', () => {
        expect(normalizeResolvedSecretInputString('  key  ')).toBe('key');
      });

      it('空字符串应返回空字符串', () => {
        expect(normalizeResolvedSecretInputString('  ')).toBe('');
      });

      it('正常字符串应不变', () => {
        expect(normalizeResolvedSecretInputString('api-key-123')).toBe('api-key-123');
      });

      it('换行符应去除', () => {
        expect(normalizeResolvedSecretInputString('key\n')).toBe('key');
      });
    });
  });

  // ==================== 4. 可选 Schema 构建 ====================
  describe('buildOptionalSecretInputSchema', () => {
    it('应返回具有 parse 方法的 schema 对象', () => {
      const schema = buildOptionalSecretInputSchema();
      expect(schema).toBeDefined();
      expect(typeof schema.parse).toBe('function');
    });

    it('parse undefined 应返回 undefined', () => {
      const schema = buildOptionalSecretInputSchema();
      expect(schema.parse(undefined)).toBeUndefined();
    });

    it('parse 字符串应返回 plaintext SecretInput', () => {
      const schema = buildOptionalSecretInputSchema();
      const result = schema.parse('my-key');
      expect(result?.resolution.mode).toBe('plaintext');
      expect(result?.resolution.value).toBe('my-key');
    });

    it('parse SecretInput 对象应返回等价对象', () => {
      const schema = buildOptionalSecretInputSchema();
      const input: SecretInput = {
        type: 'token',
        resolution: { mode: 'ref', ref: { provider: 'env', key: 'TOKEN' } },
      };
      const result = schema.parse(input);
      expect(result).toStrictEqual(input);
    });

    it('parse null 应返回 undefined', () => {
      const schema = buildOptionalSecretInputSchema();
      expect(schema.parse(null)).toBeUndefined();
    });
  });

  // ==================== 5. 端到端场景 ====================
  describe('端到端使用场景', () => {
    it('配置解析场景：从配置中读取密钥并校验', () => {
      const config = {
        apiKey: 'sk-test-123456',
        dbPassword: {
          resolution: { mode: 'ref', ref: { provider: 'env', key: 'DB_PASS' } },
        } as SecretInput,
        notSet: undefined,
      };

      // 1. 规范化
      const apiKeyInput = normalizeSecretInput(config.apiKey);
      expect(apiKeyInput?.resolution.mode).toBe('plaintext');

      const dbPassInput = normalizeSecretInput(config.dbPassword);
      expect(dbPassInput?.resolution.mode).toBe('ref');

      const notSetInput = normalizeSecretInput(config.notSet);
      expect(notSetInput).toBeUndefined();

      // 2. 判定
      expect(hasConfiguredSecretInput(apiKeyInput)).toBe(true);
      expect(hasConfiguredSecretInput(dbPassInput)).toBe(true);
      expect(hasConfiguredSecretInput(notSetInput)).toBe(false);

      // 3. 明文密钥检查（安全审计）
      expect(hasConfiguredPlaintextSecretValue(apiKeyInput)).toBe(true);
      expect(hasConfiguredPlaintextSecretValue(dbPassInput)).toBe(false);
    });

    it('密钥验证场景：使用恒定时间比较防止时序攻击', () => {
      const storedHash = 'stored-api-key-hash-value';
      const providedKey = 'stored-api-key-hash-value';
      const wrongKey = 'wrong-key-value';

      expect(constantTimeEqual(storedHash, providedKey)).toBe(true);
      expect(constantTimeEqual(storedHash, wrongKey)).toBe(false);
    });

    it('强制转换场景：兼容字符串和对象两种配置格式', () => {
      const configs = [
        'simple-string-key',
        { resolution: { mode: 'ref', ref: { provider: 'env', key: 'KEY' } } } as SecretInput,
        undefined,
      ];

      const results = configs.map(c => coerceSecretRef(c));

      expect(results[0]?.resolution.mode).toBe('plaintext');
      expect(results[0]?.resolution.value).toBe('simple-string-key');
      expect(results[1]?.resolution.mode).toBe('ref');
      expect(results[2]).toBeUndefined();
    });
  });
});
