// 生成 CLI 启动元数据的读取/缓存，供 help 和 completion 快速路径使用。
// 原模块仅依赖 node 内置模块，无外部依赖。
//
// 适配说明：原 openclaw 版本使用 `import.meta.url` 传给 `fileURLToPath`，
// 由于 server/tsconfig.json 配置 `module: "commonjs"`，`import.meta` 不可用（TS1343）。
// 这里改为接受 `moduleFilePath`（即 commonjs 的 `__filename`），由调用方传入。
import fs from "node:fs";
import path from "node:path";

const STARTUP_METADATA_FILE = "cli-startup-metadata.json";
const startupMetadataByPath = new Map<string, Record<string, unknown> | null>();

function resolveStartupMetadataPathCandidates(moduleFilePath: string): string[] {
  const moduleDir = path.dirname(moduleFilePath);
  return [
    path.resolve(moduleDir, STARTUP_METADATA_FILE),
    path.resolve(moduleDir, "..", STARTUP_METADATA_FILE),
  ];
}

/**
 * 读取 CLI 启动元数据。
 * @param moduleFilePath 调用方模块的文件路径（commonjs 下即 `__filename`）。
 */
export function readCliStartupMetadata(moduleFilePath: string): Record<string, unknown> | null {
  // 同时检查源码和 bundle 两种布局；缓存未命中结果以使重复 help 保持低成本。
  for (const metadataPath of resolveStartupMetadataPathCandidates(moduleFilePath)) {
    const cached = startupMetadataByPath.get(metadataPath);
    if (cached !== undefined) {
      if (cached) {
        return cached;
      }
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
      startupMetadataByPath.set(metadataPath, parsed);
      return parsed;
    } catch {
      // 在回退到动态启动工作之前尝试下一种 bundled/源码布局。
      startupMetadataByPath.set(metadataPath, null);
    }
  }
  return null;
}

export const testing = {
  resolveStartupMetadataPathCandidates,
  clearStartupMetadataCache(): void {
    startupMetadataByPath.clear();
  },
};
export { testing as __testing };
