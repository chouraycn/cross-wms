/**
 * 将任意值转换为 JSON 安全值。
 * - undefined / 函数 / bigint / symbol 通过 JSON 序列化往返进行处理
 * - Error 仅保留 name 与 message
 * - 解析失败时回退为类型相关的字符串表示
 */
export function toCodeModeJsonSafe(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : (JSON.parse(serialized) as unknown);
  } catch {
    if (value instanceof Error) {
      return { name: value.name, message: value.message };
    }
    if (value === null) {
      return null;
    }
    switch (typeof value) {
      case "string":
      case "number":
      case "boolean":
        return value;
      case "bigint":
      case "symbol":
      case "function":
        return String(value);
      default:
        return Object.prototype.toString.call(value);
    }
  }
}
