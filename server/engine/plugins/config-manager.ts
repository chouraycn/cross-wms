import { logger } from '../../logger.js';
import type { PluginConfigSchema, PluginConfigProperty } from './types.js';

/**
 * 插件配置管理 — schema 校验 / 配置合并 / 配置访问
 *
 * - 不依赖 ajv / zod（保持纯逻辑，便于测试与跨平台）
 * - 支持 JSON Schema 子集：type / required / enum / default / items / properties
 * - 配置合并采用「default → stored →override」三层策略
 */

export interface ConfigManager {
  /** 注册插件配置 schema */
  registerSchema(pluginId: string, schema: PluginConfigSchema): void;
  /** 取消注册 */
  unregisterSchema(pluginId: string): void;
  /** 校验配置是否满足 schema */
  validate(pluginId: string, config: Record<string, unknown>): ConfigValidationResult;
  /** 合并默认值与已存储值 */
  merge(pluginId: string, stored: Record<string, unknown>, override?: Record<string, unknown>): Record<string, unknown>;
  /** 应用默认值到配置 */
  applyDefaults(pluginId: string, config: Record<string, unknown>): Record<string, unknown>;
  /** 获取已注册 schema */
  getSchema(pluginId: string): PluginConfigSchema | undefined;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

class ConfigManagerImpl implements ConfigManager {
  private schemas = new Map<string, PluginConfigSchema>();

  registerSchema(pluginId: string, schema: PluginConfigSchema): void {
    this.schemas.set(pluginId, schema);
    logger.debug(`[Plugins:ConfigManager] Registered schema for ${pluginId}`);
  }

  unregisterSchema(pluginId: string): void {
    this.schemas.delete(pluginId);
  }

  getSchema(pluginId: string): PluginConfigSchema | undefined {
    return this.schemas.get(pluginId);
  }

  validate(pluginId: string, config: Record<string, unknown>): ConfigValidationResult {
    const schema = this.schemas.get(pluginId);
    if (!schema) return { valid: true, errors: [] };
    const errors: string[] = [];
    this.validateObject(config, schema, '', errors);
    return { valid: errors.length === 0, errors };
  }

  private validateObject(
    obj: Record<string, unknown>,
    schema: PluginConfigSchema | PluginConfigProperty,
    path: string,
    errors: string[],
  ): void {
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];
    for (const reqKey of required) {
      if (!(reqKey in obj)) {
        errors.push(`${path || 'root'}: 缺少必需字段 ${reqKey}`);
      }
    }
    for (const [key, value] of Object.entries(obj)) {
      const propSchema = properties[key];
      if (!propSchema) {
        if (schema.additionalProperties === false) {
          errors.push(`${path || 'root'}: 未知字段 ${key}`);
        }
        continue;
      }
      this.validateProperty(value, propSchema, path ? `${path}.${key}` : key, errors);
    }
  }

  private validateProperty(value: unknown, schema: PluginConfigProperty, path: string, errors: string[]): void {
    if (value === null || value === undefined) return;
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${path}: 值 ${JSON.stringify(value)} 不在允许的枚举内 ${JSON.stringify(schema.enum)}`);
    }
    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${path}: 期望 string，实际 ${typeof value}`);
        }
        break;
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          errors.push(`${path}: 期望 number，实际 ${typeof value}`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${path}: 期望 boolean，实际 ${typeof value}`);
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${path}: 期望 array，实际 ${typeof value}`);
          break;
        }
        if (schema.items) {
          value.forEach((item, idx) => {
            this.validateProperty(item, schema.items!, `${path}[${idx}]`, errors);
          });
        }
        break;
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`${path}: 期望 object，实际 ${typeof value}`);
          break;
        }
        this.validateObject(value as Record<string, unknown>, schema, path, errors);
        break;
    }
  }

  applyDefaults(pluginId: string, config: Record<string, unknown>): Record<string, unknown> {
    const schema = this.schemas.get(pluginId);
    if (!schema?.properties) return { ...config };
    const result: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (propSchema.default !== undefined) {
        result[key] = propSchema.default;
      }
    }
    return { ...result, ...config };
  }

  merge(
    pluginId: string,
    stored: Record<string, unknown>,
    override?: Record<string, unknown>,
  ): Record<string, unknown> {
    const withDefaults = this.applyDefaults(pluginId, stored);
    return override ? { ...withDefaults, ...override } : withDefaults;
  }
}

/** 全局单例 */
export const pluginConfigManager = new ConfigManagerImpl();

/** 测试辅助：返回一个全新的 ConfigManager 实例 */
export function createConfigManager(): ConfigManager {
  return new ConfigManagerImpl();
}

/**
 * 工具函数：检查配置是否满足 schema（不依赖单例）。
 */
export function validateConfig(
  schema: PluginConfigSchema,
  config: Record<string, unknown>,
): ConfigValidationResult {
  const temp = new ConfigManagerImpl();
  temp.registerSchema('__temp__', schema);
  return temp.validate('__temp__', config);
}
