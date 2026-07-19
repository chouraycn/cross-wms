// 移植自 openclaw/openclaw/src/infra/net/form-data.ts
// 已升级为真实实现

export function isFormDataLike(value: unknown): value is FormData {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).entries === "function" &&
    (value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag] === "FormData"
  );
}
