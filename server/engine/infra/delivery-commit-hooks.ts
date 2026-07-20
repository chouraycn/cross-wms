// 移植自 openclaw/src/infra/delivery-commit-hooks.ts
// 降级：channel plugin 依赖简化

export type OutboundDeliveryCommitHook = {
  name: string;
  run: (params: { result: unknown }) => Promise<void>;
};

const hooks: OutboundDeliveryCommitHook[] = [];

/** Attaches a commit hook to be run after outbound delivery. */
export function attachOutboundDeliveryCommitHook(hook: OutboundDeliveryCommitHook): void {
  hooks.push(hook);
}

/** Runs all attached delivery commit hooks. */
export async function runOutboundDeliveryCommitHooks(params: { result: unknown }): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook.run(params);
    } catch {
      // Commit hook failures are non-fatal
    }
  }
}

/** Checks if a value looks like an OutboundDeliveryResult array. */
export function isOutboundDeliveryResultArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
