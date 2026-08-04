// Leaf module holding a runtime hook registry, extracted to break the
// skillRuntimeBridge.ts ↔ skillLifecycle.ts cycle (#12).
//
// skillRuntimeBridge registers its functions here at module load; skillLifecycle
// calls them via this registry instead of statically importing skillRuntimeBridge.
// The remaining edge (skillRuntimeBridge → skillLifecycle) is a one-way dynamic
// import, so the cycle is fully broken. Both modules load at startup, so hooks
// are registered before any runtime call into skillLifecycle's functions.

export interface SkillSummaryEntry {
  id: string;
  name: string;
  description: string;
  group: string;
  source: string;
  disabled: boolean;
}

export interface SkillRuntimeBridgeHooks {
  initSkillRuntime: () => Promise<{ loaded: number; dirs: number }>;
  resetSkillRuntime: () => Promise<void>;
  setSkillDisabled: (id: string, disabled: boolean) => void;
  listAvailableSkills: (includeDisabled?: boolean) => SkillSummaryEntry[];
}

let registeredHooks: SkillRuntimeBridgeHooks | null = null;

export function registerSkillRuntimeBridgeHooks(hooks: SkillRuntimeBridgeHooks): void {
  registeredHooks = hooks;
}

function requireHooks(): SkillRuntimeBridgeHooks {
  if (!registeredHooks) {
    throw new Error('skillRuntimeBridge hooks not registered yet');
  }
  return registeredHooks;
}

export function initSkillRuntime(): Promise<{ loaded: number; dirs: number }> {
  return requireHooks().initSkillRuntime();
}

export function resetSkillRuntime(): Promise<void> {
  return requireHooks().resetSkillRuntime();
}

export function setSkillDisabled(id: string, disabled: boolean): void {
  return requireHooks().setSkillDisabled(id, disabled);
}

export function listAvailableSkills(includeDisabled?: boolean): SkillSummaryEntry[] {
  return requireHooks().listAvailableSkills(includeDisabled);
}
