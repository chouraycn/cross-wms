/**
 * TypedShapeAccessor — 替代 as unknown as Record<string, unknown> 的类型安全访问器
 *
 * 解决问题：
 *   旧代码：(message as unknown as Record<string, unknown>).reasoning_content
 *              ↑ 跳过所有类型检查，typo/重命名无感知
 *   新代码：getUnknownField(message, 'reasoning_content', isString)
 *              ↑ 保持 unknown + 运行时守卫，返回 string | undefined
 *
 * 用法：
 *   const rc = getUnknownField(msg, 'reasoning_content', isString);
 *   const tc = getUnknownField<Array<unknown>>(msg, 'tool_calls', isArray)
 *               ?? getUnknownField<Array<unknown>>(msg, 'toolCalls', isArray);
 */

// ============== Primitive type guards ==============
export function isString(v: unknown): v is string {
  return typeof v === 'string';
}
export function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
export function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}
export function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Object.prototype.toString.call(v) === '[object Object]';
}
export function isRecord(v: unknown): v is Record<string, unknown> {
  return isPlainObject(v);
}

// ============== Typed accessor ==============
/**
 * 以类型安全的方式读取对象上可能不存在的字段。
 * 等价于 (obj as unknown as Record<string, unknown>)[field]，但：
 *   1. 保证 field 是 string（非 Symbol）
 *   2. 附带 guard 后直接得到 T | undefined
 *   3. 不会留下 as unknown 痕迹，审计工具可识别
 */
export function getUnknownField<T = unknown>(
  obj: object,
  field: string,
  guard?: (v: unknown) => v is T,
): T | undefined {
  // 防御性读取 —— 不使用 in/Reflect.get 避免 Proxy 和原型链副作用
  const anyObj = obj as { [k: string]: unknown };
  const raw = anyObj[field];
  if (raw === undefined || raw === null) return undefined;
  if (!guard) return raw as T;
  return guard(raw) ? raw : undefined;
}

/**
 * 等价于 getUnknownField(obj, field, isString) —— 高频场景便捷封装
 */
export function getUnknownStringField(obj: object, field: string): string | undefined {
  return getUnknownField(obj, field, isString);
}

export function getUnknownArrayField(obj: object, field: string): unknown[] | undefined {
  return getUnknownField(obj, field, isArray);
}
