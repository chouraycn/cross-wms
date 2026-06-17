/**
 * OutputValidator — 结构化输出校验
 *
 * v6.0: P1-2 JSON Schema 校验 + 自动修复
 * - 对已知 API（WMS、Web）预定义 schema
 * - 校验失败：自动修复（补默认值、类型转换）→ 修复成功继续 → 失败标记
 * - 标记 validation_failed 的结果附加反思提示
 * - 自动重试 ≤ 1 次
 */

import Ajv, { type ValidateFunction } from 'ajv';

// ===================== 类型定义 =====================

export interface ValidationResult {
  isValid: boolean;
  data: unknown;
  errors: string[];
  wasRepaired: boolean;
  repairDetails?: string[];
}

// ===================== WMS 核心 API Schema 定义 =====================

const WMS_SCHEMAS: Record<string, object> = {
  // 出库单查询
  'wms_outbound_list': {
    type: 'object',
    properties: {
      code: { type: 'number' },
      message: { type: 'string' },
      data: {
        type: 'object',
        properties: {
          list: { type: 'array', items: { type: 'object' } },
          total: { type: 'number' },
          pageNo: { type: 'number' },
          pageSize: { type: 'number' },
        },
      },
    },
  },
  // 入库单查询
  'wms_inbound_list': {
    type: 'object',
    properties: {
      code: { type: 'number' },
      message: { type: 'string' },
      data: {
        type: 'object',
        properties: {
          list: { type: 'array', items: { type: 'object' } },
          total: { type: 'number' },
        },
      },
    },
  },
  // 库存查询
  'wms_inventory_query': {
    type: 'object',
    properties: {
      code: { type: 'number' },
      message: { type: 'string' },
      data: {
        type: 'object',
        properties: {
          list: { type: 'array', items: { type: 'object' } },
          total: { type: 'number' },
        },
      },
    },
  },
  // 通用 API 响应
  'generic_api_response': {
    type: 'object',
    properties: {
      code: { type: 'number' },
      message: { type: 'string' },
      data: {},
    },
  },
};

// ===================== 默认值映射 =====================

const DEFAULT_VALUES: Record<string, unknown> = {
  'array': [],
  'object': {},
  'number': 0,
  'string': '',
  'boolean': false,
};

// ===================== OutputValidator 类 =====================

/**
 * 结构化输出校验器。
 *
 * 使用 Ajv (JSON Schema) 校验已知 API 返回值结构，
 * 校验失败时尝试自动修复（补默认值、类型转换），
 * 修复失败则标记 validation_failed 并附加反思提示。
 *
 * 特性：
 * - 预定义 WMS API schema（出库/入库/库存/通用）
 * - 工具名 + 返回内容双维度匹配 schema
 * - 自动修复缺失字段和类型错误
 * - 最多自动重试 1 次
 */
export class OutputValidator {
  private ajv: Ajv;
  private schemas: Map<string, ValidateFunction>;
  private retryCount: Map<string, number> = new Map();
  private static MAX_RETRIES = 1;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, useDefaults: true });
    this.schemas = new Map();
    this.registerSchemas();
  }

  /** 注册所有预定义 schema */
  private registerSchemas(): void {
    for (const [name, schema] of Object.entries(WMS_SCHEMAS)) {
      try {
        this.schemas.set(name, this.ajv.compile(schema));
      } catch (e) {
        console.warn(`[OutputValidator] Schema ${name} 编译失败:`, e);
      }
    }
  }

  /**
   * 根据工具名猜测 schema 名。
   * 优先按工具名匹配，其次按返回内容特征匹配。
   */
  private guessSchemaName(toolName: string, result: string): string | null {
    const lower = toolName.toLowerCase();
    if (lower.includes('outbound') || lower.includes('出库')) return 'wms_outbound_list';
    if (lower.includes('inbound') || lower.includes('入库')) return 'wms_inbound_list';
    if (lower.includes('inventory') || lower.includes('库存')) return 'wms_inventory_query';
    if (lower.includes('api') || lower.includes('web_api')) return 'generic_api_response';
    // 尝试根据返回内容判断
    try {
      const parsed = JSON.parse(result);
      if (parsed.code !== undefined && parsed.data !== undefined) return 'generic_api_response';
    } catch {
      // 非 JSON 内容，不校验
    }
    return null;
  }

  /**
   * 校验并尝试修复 JSON 输出。
   *
   * @param toolName - 工具名（用于匹配 schema）
   * @param result - 工具返回的原始字符串
   * @returns 校验结果（含是否有效、修复详情、错误信息）
   */
  validate(toolName: string, result: string): ValidationResult {
    // 尝试解析 JSON
    let data: unknown;
    try {
      data = JSON.parse(result);
    } catch {
      return {
        isValid: false,
        data: result,
        errors: ['JSON 解析失败'],
        wasRepaired: false,
      };
    }

    // 查找匹配的 schema
    const schemaName = this.guessSchemaName(toolName, result);
    if (!schemaName || !this.schemas.has(schemaName)) {
      // 无匹配 schema，跳过校验
      return { isValid: true, data, errors: [], wasRepaired: false };
    }

    const validate = this.schemas.get(schemaName)!;
    const valid = validate(data);

    if (valid) {
      return { isValid: true, data, errors: [], wasRepaired: false };
    }

    // 校验失败，尝试自动修复
    const errors = validate.errors?.map(e => `${e.instancePath} ${e.message ?? '未知错误'}`) ?? [];
    const repaired = this.attemptRepair(data, validate);

    if (repaired.success) {
      return {
        isValid: true,
        data: repaired.data,
        errors,
        wasRepaired: true,
        repairDetails: repaired.details,
      };
    }

    return {
      isValid: false,
      data,
      errors,
      wasRepaired: false,
    };
  }

  /**
   * 尝试自动修复缺失/错误字段。
   * 修复策略：
   * - required 缺失属性 → 补默认值
   * - type 不匹配 → 尝试类型转换
   */
  private attemptRepair(data: unknown, validate: ValidateFunction): { success: boolean; data: unknown; details: string[] } {
    const details: string[] = [];
    let repaired = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

    for (const error of validate.errors ?? []) {
      const path = error.instancePath || '';
      const parts = path.split('/').filter(Boolean);

      // 补缺失属性
      if (error.keyword === 'required') {
        const missingProp = (error.params as Record<string, unknown>)?.missingProperty as string | undefined;
        if (missingProp) {
          // 尝试从 schema 获取属性类型以推断默认值
          const propSchema = this.getPropSchema(validate, parts, missingProp);
          const defaultVal = propSchema ? DEFAULT_VALUES[propSchema.type as string] ?? null : null;
          this.setNestedValue(repaired, parts, missingProp, defaultVal);
          details.push(`补全缺失字段 ${path}.${missingProp} = ${JSON.stringify(defaultVal)}`);
        }
      }

      // 类型转换
      if (error.keyword === 'type') {
        const expectedType = (error.params as Record<string, unknown>)?.type as string | undefined;
        const currentVal = this.getNestedValue(repaired, parts);
        if (currentVal !== undefined && expectedType) {
          const converted = this.convertType(currentVal, expectedType);
          if (converted !== null) {
            this.setNestedValue(repaired, parts.slice(0, -1), parts[parts.length - 1], converted);
            details.push(`类型转换 ${path}: ${expectedType}`);
          }
        }
      }
    }

    // 重新校验修复后的数据
    if (details.length > 0 && validate(repaired)) {
      return { success: true, data: repaired, details };
    }

    return { success: false, data: repaired, details };
  }

  /**
   * 从 validate 函数的 schema 中获取指定属性的子 schema。
   */
  private getPropSchema(validate: ValidateFunction, pathParts: string[], propName: string): { type?: string } | null {
    try {
      // Ajv validate.schema 包含编译后的 schema
      const schema = validate.schema as Record<string, unknown> | undefined;
      if (!schema) return null;

      // Navigate to the parent schema
      let current = schema;
      for (const part of pathParts) {
        if (current && typeof current === 'object') {
          const next = (current as Record<string, unknown>).properties?.[part];
          if (next && typeof next === 'object') {
            current = next as Record<string, unknown>;
          } else {
            return null;
          }
        }
      }

      // Get the property schema
      const props = (current as Record<string, unknown>).properties as Record<string, unknown> | undefined;
      if (props && props[propName] && typeof props[propName] === 'object') {
        return props[propName] as { type?: string };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** 获取嵌套对象中指定路径的值 */
  private getNestedValue(obj: Record<string, unknown>, parts: string[]): unknown {
    let current: unknown = obj;
    for (const p of parts) {
      if (current && typeof current === 'object') {
        current = (current as Record<string, unknown>)?.[p];
      } else {
        return undefined;
      }
    }
    return current;
  }

  /** 设置嵌套对象中指定路径的值 */
  private setNestedValue(obj: Record<string, unknown>, pathParts: string[], key: string, value: unknown): void {
    let current: Record<string, unknown> = obj;
    for (const p of pathParts) {
      if (!current[p] || typeof current[p] !== 'object') {
        current[p] = {};
      }
      current = current[p] as Record<string, unknown>;
    }
    current[key] = value;
  }

  /** 尝试类型转换 */
  private convertType(value: unknown, targetType: string): unknown {
    try {
      switch (targetType) {
        case 'number': {
          const num = Number(value);
          return isNaN(num) ? null : num;
        }
        case 'string': return String(value);
        case 'boolean': return Boolean(value);
        default: return null;
      }
    } catch {
      return null;
    }
  }

  /** 判断是否可以重试（最多 1 次） */
  canRetry(toolName: string): boolean {
    const current = this.retryCount.get(toolName) ?? 0;
    return current < OutputValidator.MAX_RETRIES;
  }

  /** 记录重试次数 */
  recordRetry(toolName: string): void {
    this.retryCount.set(toolName, (this.retryCount.get(toolName) ?? 0) + 1);
  }

  /** 重置重试计数 */
  reset(): void {
    this.retryCount.clear();
  }
}