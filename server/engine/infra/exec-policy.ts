// 移植自 openclaw/src/infra/exec-policy.ts

import type { ExecAsk, ExecMode, ExecSecurity } from "./exec-approvals.js";

export type ExecPolicyLayer = {
  mode?: ExecMode;
  security?: ExecSecurity;
  ask?: ExecAsk;
};

/** Resolve exec policy for a given mode. Simplified port without full config access. */
function resolveExecPolicyForMode(mode: ExecMode): Partial<ExecPolicyLayer> {
  switch (mode) {
    case "auto-approve":
      return { security: "standard", ask: "never" };
    case "ask-each-time":
      return { security: "standard", ask: "always" };
    case "manual":
      return { security: "strict", ask: "always" };
    default:
      return {};
  }
}

export function applyExecPolicyLayer<TBase extends ExecPolicyLayer>(
  base: TBase,
  layer?: ExecPolicyLayer,
): TBase & ExecPolicyLayer {
  if (!layer) {
    return base;
  }
  if (layer.mode) {
    return {
      ...base,
      mode: layer.mode,
      ...resolveExecPolicyForMode(layer.mode),
    } as unknown as TBase & ExecPolicyLayer;
  }
  if (layer.security !== undefined || layer.ask !== undefined) {
    const { mode: _mode, ...baseWithoutMode } = base;
    return {
      ...baseWithoutMode,
      security: layer.security ?? base.security,
      ask: layer.ask ?? base.ask,
    } as unknown as TBase & ExecPolicyLayer;
  }
  return base;
}
