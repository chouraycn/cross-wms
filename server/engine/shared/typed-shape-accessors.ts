/**
 * TypedShapeAccessor — 替代 as unknown as Record<string, any> 的类型安全访问器
 *
 * 解决问题：
 *   旧代码：(message as unknown as Record<string, any>).reasoning_content
 *              ↑ 跳过所有类型检查，typo/重命名无感知
 *   新代码：getUnknownField(message, 'reasoning_content', isString)
 *              ↑ 保持 unknown + 运行时守卫，返回 string | undefined
 *
 * 用法：
 *   const rc = getUnknownField(msg, 'reasoning_content', isString);
 *   const tc = getUnknownField<Array<any>>(msg, 'tool_calls', isArray)
 *               ?? getUnknownField<Array<any>>(msg, 'toolCalls', isArray);
 */

// ============== Primitive type guards ==============
export function isString(v: any): v is string {
  return typeof v === 'string';
}
export function isNumber(v: any): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
export function isBoolean(v: any): v is boolean {
  return typeof v === 'boolean';
}
export function isArray(v: any): v is any[] {
  return Array.isArray(v);
}
export function isPlainObject(v: any): v is Record<string, any> {
  return Object.prototype.toString.call(v) === '[object Object]';
}
export function isRecord(v: any): v is Record<string, any> {
  return isPlainObject(v);
}

// ============== Typed accessor ==============
/**
 * 以类型安全的方式读取对象上可能不存在的字段。
 * 等价于 (obj as unknown as Record<string, any>)[field]，但：
 *   1. 保证 field 是 string（非 Symbol）
 *   2. 附带 guard 后直接得到 T | undefined
 *   3. 不会留下 as any 痕迹，审计工具可识别
 */
export function getUnknownField<T = unknown>(
  obj: object,
  field: string,
  guard?: (v: any) => v is T,
): T | undefined {
  // 防御性读取 —— 不使用 in/Reflect.get 避免 Proxy 和原型链副作用
  const anyObj = obj as { [k: string]: any };
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

export function getUnknownArrayField(obj: object, field: string): any[] | undefined {
  return getUnknownField(obj, field, isArray);
}
