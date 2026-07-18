/**
 * 变量上下文系统
 * 提供变量存储、表达式求值、数据合并等功能
 */

import type { IVariableContext } from './types.js';

/**
 * 变量上下文类
 * 管理工作流执行过程中的变量和表达式求值
 */
export class VariableContext implements IVariableContext {
  private variables: Map<string, unknown>;

  constructor(initialVariables?: Record<string, unknown>) {
    this.variables = new Map();
    if (initialVariables) {
      this.merge(initialVariables);
    }
  }

  /**
   * 获取变量值
   * @param key 变量名，支持点路径（如 user.name）
   * @returns 变量值
   */
  get(key: string): unknown {
    if (!key) return undefined;

    const parts = key.split('.');
    let current: unknown = this.variables.get(parts[0]);

    if (parts.length === 1) {
      return current;
    }

    for (let i = 1; i < parts.length; i++) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[parts[i]];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * 设置变量值
   * @param key 变量名，支持点路径
   * @param value 变量值
   */
  set(key: string, value: unknown): void {
    if (!key) return;

    const parts = key.split('.');
    if (parts.length === 1) {
      this.variables.set(key, value);
      return;
    }

    let current: Record<string, unknown>;
    const rootKey = parts[0];
    const existing = this.variables.get(rootKey);

    if (existing && typeof existing === 'object' && existing !== null) {
      current = existing as Record<string, unknown>;
    } else {
      current = {};
      this.variables.set(rootKey, current);
    }

    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * 检查变量是否存在
   * @param key 变量名，支持点路径
   * @returns 是否存在
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * 求值表达式
   * 支持 {{variable}} 形式的变量插值和简单表达式
   * @param expression 表达式字符串
   * @returns 求值结果
   */
  evaluate(expression: string): unknown {
    if (!expression || typeof expression !== 'string') {
      return expression;
    }

    if (this.isSimpleInterpolation(expression)) {
      const varName = expression.slice(2, -2).trim();
      return this.get(varName);
    }

    if (expression.includes('{{')) {
      return this.interpolateString(expression);
    }

    return this.evaluateExpression(expression);
  }

  /**
   * 判断是否是简单的变量插值（整个字符串就是一个变量引用）
   */
  private isSimpleInterpolation(expr: string): boolean {
    return expr.startsWith('{{') && expr.endsWith('}}') &&
      expr.indexOf('{{') === 0 && expr.lastIndexOf('}}') === expr.length - 2;
  }

  /**
   * 字符串插值，替换所有 {{var}} 形式的占位符
   */
  private interpolateString(str: string): string {
    return str.replace(/\{\{([^}]+)\}\}/g, (_match, expr: string) => {
      const value = this.evaluateExpression(expr.trim());
      return value !== undefined && value !== null ? String(value) : '';
    });
  }

  /**
   * 求值 JavaScript 表达式
   */
  private evaluateExpression(expr: string): unknown {
    try {
      const variablesObj = this.snapshot();
      const keys = Object.keys(variablesObj);
      const values = keys.map(k => variablesObj[k]);
      const fn = new Function(...keys, `return (${expr});`);
      return fn(...values);
    } catch {
      return undefined;
    }
  }

  /**
   * 合并多个变量
   * @param data 要合并的变量对象
   */
  merge(data: Record<string, unknown>): void {
    if (!data) return;

    for (const [key, value] of Object.entries(data)) {
      this.set(key, value);
    }
  }

  /**
   * 获取变量快照（浅拷贝）
   * @returns 所有变量的对象形式
   */
  snapshot(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.variables.entries()) {
      result[key] = value;
    }
    return result;
  }

  /**
   * 清空所有变量
   */
  clear(): void {
    this.variables.clear();
  }

  /**
   * 删除变量
   * @param key 变量名
   */
  delete(key: string): void {
    const parts = key.split('.');
    if (parts.length === 1) {
      this.variables.delete(key);
      return;
    }

    const rootKey = parts[0];
    let current = this.variables.get(rootKey) as Record<string, unknown> | undefined;
    if (!current || typeof current !== 'object') return;

    for (let i = 1; i < parts.length - 1; i++) {
      current = current?.[parts[i]] as Record<string, unknown> | undefined;
      if (!current || typeof current !== 'object') return;
    }

    delete current[parts[parts.length - 1]];
  }

  /**
   * 获取变量数量
   */
  get size(): number {
    return this.variables.size;
  }
}
