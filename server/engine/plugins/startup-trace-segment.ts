/**
 * 净化插件启动 trace 段，供诊断标签使用。
 * 无外部依赖。
 */
const SAFE_STARTUP_TRACE_SEGMENT_CHAR = /^[A-Za-z0-9_-]$/u;

export function encodeStartupTraceSegment(value: string): string {
  if (!value) {
    return "~";
  }
  let encoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    if (SAFE_STARTUP_TRACE_SEGMENT_CHAR.test(char)) {
      encoded += char;
      continue;
    }
    encoded += `~${value.charCodeAt(index).toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return encoded;
}
