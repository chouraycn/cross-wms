/**
 * stableStringify — 稳定序列化
 *
 * 参照 openclaw stable-stringify.ts 设计，用于把任意值序列化为
 * 确定性的 JSON 字符串（key 按字母序排列），可作为 cache key 使用。
 *
 * 支持的类型：
 * - 基本类型：string / number / boolean / null / undefined / bigint
 * - 对象：普通对象、数组、Date、RegExp、Error、Map、Set
 * - 特殊：Uint8Array / Buffer、Symbol（转描述）
 * - 循环引用检测
 *
 * 注意：不保证与 JSON.stringify 完全一致（如 undefined 会输出 "undefined"），
 * 仅保证同一输入产生同一输出，用于哈希/缓存键。
 */

const MAX_DEPTH = 50;

export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return stringify(value, seen, 0);
}

function stringify(value: unknown, seen: WeakSet<object>, depth: number): string {
  if (depth > MAX_DEPTH) {
    return '"[MaxDepthExceeded]"';
  }

  // null
  if (value === null) return 'null';

  // undefined
  if (value === undefined) return 'undefined';

  const type = typeof value;

  // 基本类型
  if (type === 'string') return JSON.stringify(value);
  if (type === 'number') {
    const num = value as number;
    if (Number.isNaN(num)) return '"NaN"';
    if (!Number.isFinite(num)) return num > 0 ? '"Infinity"' : '"-Infinity"';
    return String(num);
  }
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'bigint') return `${(value as bigint).toString()}n`;
  if (type === 'symbol') return JSON.stringify(`Symbol(${(value as symbol).description || ''})`);

  // 对象类型
  if (type === 'object') {
    const obj = value as object;

    // 循环引用检测
    if (seen.has(obj)) return '"[Circular]"';
    seen.add(obj);

    try {
      // 数组
      if (Array.isArray(value)) {
        const items = value.map((item) => stringify(item, seen, depth + 1));
        return `[${items.join(',')}]`;
      }

      // Date
      if (value instanceof Date) {
        return JSON.stringify(`Date(${value.toISOString()})`);
      }

      // RegExp
      if (value instanceof RegExp) {
        return JSON.stringify(`RegExp(${value.source},${value.flags})`);
      }

      // Error
      if (value instanceof Error) {
        return JSON.stringify(`Error(${value.name}:${value.message})`);
      }

      // Buffer / Uint8Array
      if (value instanceof Uint8Array || Buffer.isBuffer?.(value)) {
        const buf = value as Uint8Array;
        // 太长的只取前 64 字节 + 长度
        const max = Math.min(buf.length, 64);
        let hex = '';
        for (let i = 0; i < max; i++) {
          hex += buf[i].toString(16).padStart(2, '0');
        }
        return JSON.stringify(`Uint8Array(len=${buf.length},head=${hex})`);
      }

      // Map
      if (value instanceof Map) {
        const entries = Array.from(value.entries());
        // 按 key 的字符串形式排序
        entries.sort((a, b) => {
          const ka = stableStringifyKey(a[0]);
          const kb = stableStringifyKey(b[0]);
          return ka.localeCompare(kb);
        });
        const items = entries.map(
          ([k, v]) => `[${stringify(k, seen, depth + 1)},${stringify(v, seen, depth + 1)}]`,
        );
        return `Map(${items.length})[${items.join(',')}]`;
      }

      // Set
      if (value instanceof Set) {
        const items = Array.from(value.values())
          .map((v) => stringify(v, seen, depth + 1))
          .sort();
        return `Set(${items.length})[${items.join(',')}]`;
      }

      // 普通对象：按 key 字母序
      const keys = Object.keys(value as Record<string, unknown>).sort();
      const pairs: string[] = [];
      for (const key of keys) {
        const val = (value as Record<string, unknown>)[key];
        pairs.push(`${JSON.stringify(key)}:${stringify(val, seen, depth + 1)}`);
      }
      return `{${pairs.join(',')}}`;
    } finally {
      seen.delete(obj);
    }
  }

  // function 等其他类型
  return JSON.stringify(`[${type}]`);
}

function stableStringifyKey(value: unknown): string {
  try {
    return stableStringify(value);
  } catch {
    return String(value);
  }
}
