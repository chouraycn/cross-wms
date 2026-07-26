// Model override provenance detects fallback-generated selections that resets should drop.
//
// 移植自 openclaw/src/config/sessions/model-override-provenance.ts
//
// 降级策略：
//  - normalizeOptionalString 改用 cross-wms 的 ../../infra/string-coerce.js，
//    语义与 @openclaw/normalization-core/string-coerce 一致（trim 后非空才返回）。
//  - SessionEntry 类型使用本地占位定义（cross-wms 的 ./types.js 尚未导出该类型）。

import { normalizeOptionalString } from "../../infra/string-coerce.js";

/** SessionEntry 占位类型（仅包含本模块用到的字段）。 */
type SessionEntry = {
  providerOverride?: string;
  modelOverride?: string;
  modelOverrideFallbackOriginProvider?: string;
  modelOverrideFallbackOriginModel?: string;
  [key: string]: unknown;
};

/** Detects model overrides created by automatic fallback provenance. */
export function hasSessionAutoModelFallbackProvenance(
  entry:
    | Pick<
        SessionEntry,
        | "providerOverride"
        | "modelOverride"
        | "modelOverrideFallbackOriginProvider"
        | "modelOverrideFallbackOriginModel"
      >
    | undefined,
): boolean {
  const hasActiveOverride = Boolean(
    normalizeOptionalString(entry?.providerOverride) ||
      normalizeOptionalString(entry?.modelOverride),
  );
  return Boolean(
    hasActiveOverride &&
      normalizeOptionalString(entry?.modelOverrideFallbackOriginProvider) &&
      normalizeOptionalString(entry?.modelOverrideFallbackOriginModel),
  );
}
