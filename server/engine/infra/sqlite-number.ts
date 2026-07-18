/** 将 SQLite number 或 bigint 列转换为 JavaScript number。 */
export function normalizeSqliteNumber(value: number | bigint | null): number | undefined {
  if (typeof value === "bigint") {
    return Number(value);
  }
  return typeof value === "number" ? value : undefined;
}
