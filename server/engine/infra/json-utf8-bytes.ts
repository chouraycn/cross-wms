/**
 * JSON UTF-8 字节计数 — 用于序列化大小估算与限制
 * 参考 openclaw/src/infra/json-utf8-bytes.ts
 */

/** 返回 JSON.stringify(value) 的 UTF-8 字节长度，失败时回退到 String(value) */
export function jsonUtf8Bytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Buffer.byteLength(String(value), "utf8");
  }
}

/** 有界 JSON 遍历的字节计数结果 */
export type BoundedJsonUtf8Bytes = {
  /** 已计字节，或不完整时大于请求 max 的值 */
  bytes: number;
  /** 遍历完成（无不支持/循环/超限输入）时为 true */
  complete: boolean;
};

/** 返回 JSON UTF-8 字节长度，无法安全序列化时返回 Infinity */
export function jsonUtf8BytesOrInfinity(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string"
      ? Buffer.byteLength(serialized, "utf8")
      : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function jsonStringByteLengthUpToLimit(value: string, remainingBytes: number): number {
  if (value.length + 2 > remainingBytes) {
    return remainingBytes + 1;
  }
  return jsonUtf8BytesOrInfinity(value);
}

function* enumerableOwnEntries(value: object): Generator<[string, unknown]> {
  const record = value as Record<string, unknown>;
  for (const key in record) {
    if (Object.prototype.propertyIsEnumerable.call(record, key)) {
      yield [key, record[key]];
    }
  }
}

/** 返回 JavaScript 枚举顺序中的前几个可枚举自有键 */
export function firstEnumerableOwnKeys(value: object, maxKeys: number): string[] {
  const keys: string[] = [];
  for (const key in value as Record<string, unknown>) {
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) {
      continue;
    }
    keys.push(key);
    if (keys.length >= maxKeys) {
      break;
    }
  }
  return keys;
}

/** 不完整序列化大对象的情况下，计数 JSON UTF-8 字节直到硬上限 */
export function boundedJsonUtf8Bytes(value: unknown, maxBytes: number): BoundedJsonUtf8Bytes {
  let bytes = 0;
  const seen = new WeakSet<object>();

  const add = (amount: number): void => {
    bytes += amount;
    if (bytes > maxBytes) {
      throw new Error("json_byte_limit_exceeded");
    }
  };

  const visit = (entry: unknown, inArray: boolean): void => {
    if (entry === null) {
      add(4);
      return;
    }
    switch (typeof entry) {
      case "string":
        add(jsonStringByteLengthUpToLimit(entry, maxBytes - bytes));
        return;
      case "number":
        add(jsonUtf8BytesOrInfinity(Number.isFinite(entry) ? entry : null));
        return;
      case "boolean":
        add(entry ? 4 : 5);
        return;
      case "undefined":
      case "function":
      case "symbol":
        if (inArray) {
          add(4);
        }
        return;
      case "bigint":
        throw new Error("json_byte_length_unsupported");
      case "object":
        break;
    }

    const objectEntry = entry as object;
    if (seen.has(objectEntry)) {
      throw new Error("json_byte_length_circular");
    }
    // 自定义 toJSON 可能隐藏任意工作或重塑输出，所以有界遍历
    // 仅显式处理 Date 的已知 JSON 转换。
    if (
      typeof (objectEntry as { toJSON?: unknown }).toJSON === "function" &&
      !(objectEntry instanceof Date)
    ) {
      throw new Error("json_byte_length_custom_to_json");
    }
    seen.add(objectEntry);
    try {
      if (objectEntry instanceof Date) {
        visit(objectEntry.toJSON(), inArray);
        return;
      }
      if (Array.isArray(objectEntry)) {
        add(1);
        for (let index = 0; index < objectEntry.length; index += 1) {
          if (index > 0) {
            add(1);
          }
          visit(objectEntry[index], true);
        }
        add(1);
        return;
      }

      add(1);
      let wroteField = false;
      for (const [key, field] of enumerableOwnEntries(objectEntry)) {
        if (field === undefined || typeof field === "function" || typeof field === "symbol") {
          continue;
        }
        if (wroteField) {
          add(1);
        }
        wroteField = true;
        add(jsonStringByteLengthUpToLimit(key, maxBytes - bytes));
        add(1);
        visit(field, false);
      }
      add(1);
    } finally {
      seen.delete(objectEntry);
    }
  };

  try {
    visit(value, false);
    return { bytes, complete: true };
  } catch {
    return { bytes: Math.max(bytes, maxBytes + 1), complete: false };
  }
}
