// 移植自 openclaw/src/channels/plugins/stateful-target-drivers.ts
// 降级：channel plugin 依赖简化

export type StatefulBindingTargetReadyResult = {
  ready: boolean;
  reason?: string;
};

export type StatefulBindingTargetSessionResult = {
  target: string;
  threadId?: string;
  [key: string]: unknown;
};

export type StatefulBindingTargetResetResult = {
  reset: boolean;
  reason?: string;
};

export type StatefulBindingTargetDriver = {
  provider: string;
  isReady: (params: unknown) => Promise<StatefulBindingTargetReadyResult>;
  resolveSession: (params: unknown) => Promise<StatefulBindingTargetSessionResult | null>;
  reset: (params: unknown) => Promise<StatefulBindingTargetResetResult>;
};

const drivers = new Map<string, StatefulBindingTargetDriver>();

/** Registers a stateful binding target driver. */
export function registerStatefulBindingTargetDriver(driver: StatefulBindingTargetDriver): void {
  if (driver.provider?.trim()) {
    drivers.set(driver.provider.trim().toLowerCase(), driver);
  }
}

/** Unregisters a stateful binding target driver. */
export function unregisterStatefulBindingTargetDriver(provider: string): boolean {
  return drivers.delete(provider?.trim().toLowerCase());
}

/** Gets a stateful binding target driver. */
export function getStatefulBindingTargetDriver(provider: string): StatefulBindingTargetDriver | null {
  return drivers.get(provider?.trim().toLowerCase()) ?? null;
}

/** Resolves a stateful binding target by session key. */
export async function resolveStatefulBindingTargetBySessionKey(params: {
  provider: string;
  sessionKey: string;
}): Promise<StatefulBindingTargetSessionResult | null> {
  const driver = getStatefulBindingTargetDriver(params.provider);
  if (!driver) return null;
  return driver.resolveSession(params);
}
