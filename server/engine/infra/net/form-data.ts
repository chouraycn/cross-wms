// @ts-nocheck
export function isFormDataLike(value: any): value is FormData {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FormData).entries === "function" &&
    (value as { [Symbol.toStringTag]?: any })[Symbol.toStringTag] === "FormData"
  );
}
