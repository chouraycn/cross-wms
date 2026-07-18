// CLI channel 选项格式化器，当可用时由生成的启动元数据支持。
//
// 降级说明：
// 1. 原 openclaw 版本依赖 `@openclaw/normalization-core/string-normalization` 的 `uniqueStrings`，
//    这里改为本地实现以避免引入外部包。
// 2. 原 openclaw 版本调用 `readCliStartupMetadata(import.meta.url)`，由于本项目
//    `module: "commonjs"` 不可用 `import.meta`（TS1343），改为传入 `__filename`。
import { readCliStartupMetadata } from "./startup-metadata.js";

/**
 * 去重字符串数组并保留顺序。
 * 本地降级实现，替代 `@openclaw/normalization-core/string-normalization` 的 `uniqueStrings`。
 */
function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function dedupe(values: string[]): string[] {
  return uniqueStrings(values.filter(Boolean));
}

let precomputedChannelOptions: string[] | null | undefined;

function loadPrecomputedChannelOptions(): string[] | null {
  if (precomputedChannelOptions !== undefined) {
    return precomputedChannelOptions;
  }
  try {
    const parsed = readCliStartupMetadata(__filename) as { channelOptions?: unknown } | null;
    if (parsed && Array.isArray(parsed.channelOptions)) {
      precomputedChannelOptions = dedupe(
        parsed.channelOptions.filter((value): value is string => typeof value === "string"),
      );
      return precomputedChannelOptions;
    }
  } catch {
    // 源码检出可能尚未生成启动元数据。
  }
  precomputedChannelOptions = null;
  return null;
}

export function resolveCliChannelOptions(): string[] {
  const precomputed = loadPrecomputedChannelOptions();
  return precomputed ?? [];
}

export function formatCliChannelOptions(extra: string[] = []): string {
  const options = [...extra, ...resolveCliChannelOptions()];
  return options.length > 0 ? options.join("|") : "channel";
}

export const testing = {
  resetPrecomputedChannelOptionsForTests(): void {
    precomputedChannelOptions = undefined;
  },
};
export { testing as __testing };
