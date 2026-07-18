/**
 * RFC 7386 JSON Merge Patch 实现
 *
 * 参考 openclaw/src/config/merge-patch.ts，实现 RFC 7386 风格的
 * JSON Merge Patch 算法，并加入原型链污染防护。
 *
 * 规则：
 *   1. patch 不是对象 → 直接替换 target
 *   2. patch 中的 null 值 → 删除 target 中对应的键
 *   3. patch 中的对象 → 递归合并到 target 的对应字段
 *   4. patch 中的其他值 → 替换 target 中对应的键
 *   5. 拒绝 __proto__ / constructor / prototype 键，防止原型链污染
 */

type PlainObject = Record<string, unknown>;

/** 被拒绝的键名（防止原型链污染） */
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * 判断值是否为普通对象（非数组、非 null 的对象）
 */
function isPlainObject(value: unknown): value is PlainObject {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  // 排除数组、Date、RegExp 等内置对象类型
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * 判断键名是否被拒绝（原型链污染防护）
 */
function isBlockedKey(key: string): boolean {
  return BLOCKED_KEYS.has(key);
}

/** Merge Patch 选项 */
export interface MergePatchOptions {
  /** 是否按 id 合并对象数组（而非整体替换） */
  mergeObjectArraysById?: boolean;
  /** 需要整体替换（而非按 id 合并）的数组路径集合 */
  replaceArrayPaths?: ReadonlySet<string>;
  /** 当前递归路径（用于 replaceArrayPaths 匹配） */
  path?: string;
}

/**
 * 判断值是否为带字符串 id 的对象
 */
function isObjectWithStringId(
  value: unknown,
): value is Record<string, unknown> & { id: string } {
  if (!isPlainObject(value)) {
    return false;
  }
  return typeof value.id === 'string' && value.id.length > 0;
}

/** 拼接 merge patch 路径 */
function formatPath(parentPath: string | undefined, key: string): string {
  return parentPath ? `${parentPath}.${key}` : key;
}

/**
 * 按 id 合并对象数组
 *
 * 契约：
 *   - base 数组必须全部为带 id 的对象，否则返回 undefined（调用方整体替换）
 *   - patch 中带 id 的条目按 id 合并或追加
 *   - patch 中不带 id 的条目直接追加
 */
function mergeObjectArraysById(
  base: unknown[],
  patch: unknown[],
  options: MergePatchOptions,
  arrayPath: string,
): unknown[] | undefined {
  // base 数组必须全部为带 id 的对象
  if (!base.every(isObjectWithStringId)) {
    return undefined;
  }

  const merged: unknown[] = [...base];
  const indexById = new Map<string, number>();
  for (const [index, entry] of merged.entries()) {
    if (!isObjectWithStringId(entry)) {
      return undefined;
    }
    indexById.set(entry.id, index);
  }

  for (const patchEntry of patch) {
    if (!isObjectWithStringId(patchEntry)) {
      // 不带 id 的条目直接追加
      merged.push(structuredClone(patchEntry));
      continue;
    }

    const existingIndex = indexById.get(patchEntry.id);
    if (existingIndex === undefined) {
      // 新 id，追加
      merged.push(structuredClone(patchEntry));
      indexById.set(patchEntry.id, merged.length - 1);
      continue;
    }

    // 已有 id，递归合并
    merged[existingIndex] = applyMergePatch(merged[existingIndex], patchEntry, {
      ...options,
      path: `${arrayPath}[]`,
    });
  }

  return merged;
}

/**
 * 应用 RFC 7386 JSON Merge Patch
 *
 * 用法：
 * ```ts
 * const target = { a: 1, b: { c: 2 } };
 * const patch = { b: { c: 3 }, d: 4 };
 * const result = applyMergePatch(target, patch);
 * // => { a: 1, b: { c: 3 }, d: 4 }
 * ```
 *
 * @param target - 原始目标对象
 * @param patch - merge patch 对象
 * @param options - 合并选项
 * @returns 合并后的新对象（不修改原始对象）
 */
export function applyMergePatch(
  target: unknown,
  patch: unknown,
  options: MergePatchOptions = {},
): unknown {
  // patch 不是对象 → 直接替换
  if (!isPlainObject(patch)) {
    return patch;
  }

  // target 不是对象 → 从空对象开始
  const result: PlainObject = isPlainObject(target) ? { ...target } : {};

  for (const [key, value] of Object.entries(patch)) {
    // 原型链污染防护
    if (isBlockedKey(key)) {
      continue;
    }

    const path = formatPath(options.path, key);

    // null 值 → 删除对应键
    if (value === null) {
      delete result[key];
      continue;
    }

    // 数组按 id 合并（可选）
    if (
      options.mergeObjectArraysById &&
      Array.isArray(result[key]) &&
      Array.isArray(value)
    ) {
      if (options.replaceArrayPaths?.has(path)) {
        result[key] = value;
        continue;
      }
      const mergedArray = mergeObjectArraysById(
        result[key] as unknown[],
        value,
        options,
        path,
      );
      if (mergedArray) {
        result[key] = mergedArray;
        continue;
      }
    }

    // 对象 → 递归合并
    if (isPlainObject(value)) {
      const baseValue = result[key];
      result[key] = applyMergePatch(
        isPlainObject(baseValue) ? baseValue : {},
        value,
        { ...options, path },
      );
      continue;
    }

    // 其他值 → 直接替换
    result[key] = value;
  }

  return result;
}
