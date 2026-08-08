/**
 * 严格的普通对象守卫（排除数组与宿主对象）。
 */
export function isPlainObject(value: any): value is Record<string, any> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}
