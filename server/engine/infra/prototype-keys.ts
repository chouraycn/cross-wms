/**
 * 原型污染防护 — 阻止写入会改变对象原型的键
 * 参考 openclaw/src/infra/prototype-keys.ts
 */

const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** 返回赋值该 key 是否可能改变对象原型 */
export function isBlockedObjectKey(key: string): boolean {
  return BLOCKED_OBJECT_KEYS.has(key);
}
