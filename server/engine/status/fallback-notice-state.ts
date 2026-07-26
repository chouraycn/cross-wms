// Fallback notice state helpers track fallback notices shown to users.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { areRuntimeModelRefsEquivalent } from "../agents/model-runtime-aliases.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";

// Persisted fallback notice state is active only when the current selected and
// active runtime refs still match the recorded fallback transition.
// cross-wms does not expose a full SessionEntry type; only the fallback notice
// fields are required, so a narrow local stub keeps the helper type-safe.
export type FallbackNoticeState = {
  fallbackNoticeSelectedModel?: string;
  fallbackNoticeActiveModel?: string;
  fallbackNoticeReason?: string;
};

export function resolveActiveFallbackState(params: {
  selectedModelRef: string;
  activeModelRef: string;
  config?: OpenClawConfig;
  state?: FallbackNoticeState;
}): { active: boolean; reason?: string } {
  const selected = normalizeOptionalString(params.state?.fallbackNoticeSelectedModel);
  const active = normalizeOptionalString(params.state?.fallbackNoticeActiveModel);
  const reason = normalizeOptionalString(params.state?.fallbackNoticeReason);
  const fallbackActive =
    !areRuntimeModelRefsEquivalent(params.selectedModelRef, params.activeModelRef) &&
    selected === params.selectedModelRef &&
    active === params.activeModelRef;
  return {
    active: fallbackActive,
    reason: fallbackActive ? reason : undefined,
  };
}
