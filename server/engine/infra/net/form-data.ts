export function isFormDataLike(value: unknown): value is FormData {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof ((value as FormData) as any).entries === "function" &&
    (value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag] === "FormData"
  );
}
