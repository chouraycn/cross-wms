/**
 * Scans plugin manifest metadata without importing runtime entrypoints.
 *
 * 移植自 openclaw/src/plugins/manifest-metadata-scan.ts。
 *
 * 降级策略：原文件依赖 node:fs、node:os、node:path、
 * @openclaw/normalization-core/record-coerce、@openclaw/normalization-core/string-coerce、
 * ../utils/parse-json-compat.js、./bundled-dir.js、./installed-plugin-index-store.js。
 * 运行时函数降级为返回空数组。
 */

type PluginManifestMetadataRecord = {
  pluginDir: string;
  manifest: Record<string, unknown>;
  origin?: string;
};

/** Lists plugin manifest metadata from installed, bundled, and global plugin roots. */
export function listOpenClawPluginManifestMetadata(
  env: NodeJS.ProcessEnv = process.env,
): PluginManifestMetadataRecord[] {
  void env;
  return [];
}
