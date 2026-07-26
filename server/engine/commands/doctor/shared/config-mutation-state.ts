// Shared doctor state helpers for previewing or applying config mutations.
// 移植自 openclaw/src/commands/doctor/shared/config-mutation-state.ts
//
// 降级说明：
//  - OpenClawConfig 来自 ../../../config/types.openclaw.js
//    → cross-wms 已在 ../../../infra/_runtime-stubs.ts 提供降级类型
import type { OpenClawConfig } from "../../../infra/_runtime-stubs.js";

export type DoctorConfigMutationState = {
  /** Config currently used for command execution. */
  cfg: OpenClawConfig;
  /** Best candidate config after pending doctor mutations. */
  candidate: OpenClawConfig;
  /** True when candidate differs from the persisted/effective config path. */
  pendingChanges: boolean;
  /** User-facing fix hints printed when preview mode leaves changes unapplied. */
  fixHints: string[];
};

export type DoctorConfigMutationResult = {
  /** Candidate config after the mutation. */
  config: OpenClawConfig;
  /** User-facing change lines; empty means no mutation should be applied. */
  changes: string[];
};

/** Apply a config mutation to doctor state, writing cfg only in repair mode. */
export function applyDoctorConfigMutation(params: {
  state: DoctorConfigMutationState;
  mutation: DoctorConfigMutationResult;
  shouldRepair: boolean;
  fixHint?: string;
}): DoctorConfigMutationState {
  if (params.mutation.changes.length === 0) {
    return params.state;
  }

  return {
    cfg: params.shouldRepair ? params.mutation.config : params.state.cfg,
    candidate: params.mutation.config,
    pendingChanges: true,
    fixHints:
      !params.shouldRepair && params.fixHint
        ? [...params.state.fixHints, params.fixHint]
        : params.state.fixHints,
  };
}
