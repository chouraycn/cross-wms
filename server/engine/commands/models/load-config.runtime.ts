// Runtime seams for loading model command config and secret target ids.
// 移植自 openclaw/src/commands/models/load-config.runtime.ts
//
// 降级说明：
//  - getModelsCommandSecretTargetIds 来自 ../../cli/command-secret-targets.js
//    → cross-wms 已移植（降级版本，返回静态 target IDs 集合）
//  - getRuntimeConfig / getRuntimeConfigSourceSnapshot / setRuntimeConfigSnapshot
//    来自 ../../config/config.js → cross-wms 已移植但为 unknown 占位，
//    通过本地类型化包装恢复原签名
//  - OpenClawConfig 来自 ../../gateway/_openclaw-stubs.js（宽松占位类型），
//    与 cli/plugins-command-helpers.js、cli/command-secret-targets.js 等已移植模块保持一致，
//    避免与 config/types/openclaw.ts 完整类型（gateway.auth.token 为 SecretInput）
//    在 resolveCommandConfigWithSecrets 等签名处产生类型不兼容。
import type { OpenClawConfig } from "../../gateway/_openclaw-stubs.js";
import { getModelsCommandSecretTargetIds } from "../../cli/command-secret-targets.js";
import {
  getRuntimeConfig as getRuntimeConfigStub,
  getRuntimeConfigSourceSnapshot as getRuntimeConfigSourceSnapshotStub,
  setRuntimeConfigSnapshot as setRuntimeConfigSnapshotStub,
} from "../../config/config.js";

export type { OpenClawConfig };

/** Typed wrapper around the cross-wms stub. Returns the current runtime config. */
export function getRuntimeConfig(): OpenClawConfig {
  const value = (getRuntimeConfigStub as unknown as () => OpenClawConfig)();
  return value ?? ({} as OpenClawConfig);
}

/** Typed wrapper around the cross-wms stub. Returns the pinned source snapshot or null. */
export function getRuntimeConfigSourceSnapshot(): OpenClawConfig | null {
  const value = (
    getRuntimeConfigSourceSnapshotStub as unknown as () => OpenClawConfig | null
  )();
  return value ?? null;
}

/** Typed wrapper around the cross-wms stub. Pins the resolved config and source snapshot. */
export function setRuntimeConfigSnapshot(
  resolved: OpenClawConfig,
  source?: OpenClawConfig,
): void {
  (setRuntimeConfigSnapshotStub as unknown as (
    resolved: OpenClawConfig,
    source?: OpenClawConfig,
  ) => void)(resolved, source);
}

export { getModelsCommandSecretTargetIds };
