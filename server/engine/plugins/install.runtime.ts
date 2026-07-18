/**
 * Plugin install runtime helpers.
 * 移植自 openclaw/src/plugins/install.runtime.ts。
 * 降级策略：install.js 未导出 NpmIntegrityDrift / NpmSpecResolution，降级为本地占位类型。
 */

export type NpmIntegrityDrift = unknown;
export type NpmSpecResolution = unknown;

export {
  resolvePluginInstallDir,
  encodePluginInstallDirName,
  validatePluginId,
} from "./install-paths.js";
