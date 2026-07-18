// 配置路径数组索引解析，拒绝不切实际的稀疏写入上限
const MAX_CONFIG_PATH_ARRAY_INDEX = 100_000;

const CANONICAL_ARRAY_INDEX_SEGMENT = /^(0|[1-9]\d*)$/;

/** 解析用于 config 与 JSON 路径的规范非负数组索引段 */
export function parseConfigPathArrayIndex(segment: string): number | undefined {
  if (!CANONICAL_ARRAY_INDEX_SEGMENT.test(segment)) {
    return undefined;
  }
  const index = Number(segment);
  return Number.isSafeInteger(index) && index <= MAX_CONFIG_PATH_ARRAY_INDEX ? index : undefined;
}
