// Reset preservation keeps user-selected model/auth overrides while dropping automatic fallbacks.
//
// 移植自 openclaw/src/config/sessions/reset-preserved-selection.ts
//
// 降级策略：
//  - hasSessionAutoModelFallbackProvenance 引用同目录已移植的 ./model-override-provenance.js。
//  - SessionEntry 类型使用本地占位定义（cross-wms 的 ./types.js 尚未导出该类型）。

import { hasSessionAutoModelFallbackProvenance } from "./model-override-provenance.js";

/** SessionEntry 占位类型（仅包含本模块用到的字段）。 */
type SessionEntry = {
  providerOverride?: string;
  modelOverride?: string;
  modelOverrideSource?: "user" | "auto" | string;
  authProfileOverride?: string;
  authProfileOverrideSource?: "user" | "auto" | string;
  authProfileOverrideCompactionCount?: number;
  [key: string]: any;
};

type ResetPreservedSelectionState = Pick<
  SessionEntry,
  | "providerOverride"
  | "modelOverride"
  | "modelOverrideSource"
  | "authProfileOverride"
  | "authProfileOverrideSource"
  | "authProfileOverrideCompactionCount"
>;

/**
 * Decide which model/provider/auth overrides survive a `/new` or `/reset`.
 *
 * Only user-driven overrides (explicit `/model`, `sessions.patch`, etc.) are
 * preserved. Auto-created overrides (runtime fallbacks, rate-limit rotations)
 * are cleared so resets actually return the session to the configured default.
 *
 * Legacy entries persisted before `modelOverrideSource` was tracked are
 * treated as user-driven, matching the prior reset behavior so explicit
 * selections made before the source field existed are not silently dropped.
 */
export function resolveResetPreservedSelection(params: {
  entry?: SessionEntry;
}): Partial<ResetPreservedSelectionState> {
  const { entry } = params;
  if (!entry) {
    return {};
  }

  const preserved: Partial<ResetPreservedSelectionState> = {};
  const recoveredAutoFallbackOverride =
    entry.modelOverrideSource === undefined && hasSessionAutoModelFallbackProvenance(entry);
  // Missing source on older entries means "user" unless fallback provenance proves the runtime
  // created the override automatically.
  const preserveLegacyUserModelOverride =
    entry.modelOverrideSource === "user" ||
    (entry.modelOverrideSource === undefined &&
      Boolean(entry.modelOverride) &&
      !recoveredAutoFallbackOverride);
  if (preserveLegacyUserModelOverride && entry.modelOverride) {
    preserved.providerOverride = entry.providerOverride;
    preserved.modelOverride = entry.modelOverride;
    preserved.modelOverrideSource = "user";
  }

  if (entry.authProfileOverrideSource === "user" && entry.authProfileOverride) {
    preserved.authProfileOverride = entry.authProfileOverride;
    preserved.authProfileOverrideSource = entry.authProfileOverrideSource;
    if (entry.authProfileOverrideCompactionCount !== undefined) {
      preserved.authProfileOverrideCompactionCount = entry.authProfileOverrideCompactionCount;
    }
  }

  return preserved;
}
