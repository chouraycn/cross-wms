/**
 * 分块工具 — 将数组拆分为固定大小的块，保留顺序
 * 参考 openclaw/src/utils/chunk-items.ts
 */

export function chunkItems<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) {
    return [Array.from(items)];
  }
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}