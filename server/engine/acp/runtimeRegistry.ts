/**
 * ACP Runtime Registry
 * 运行时后端注册器 - 管理 ACP 运行时后端的注册和查询
 *
 * 参考 openclaw/src/acp/runtime/registry.ts 设计（简化版）
 */

export type AcpRuntime = {
  startSession: (params: { sessionKey: string; cwd?: string }) => Promise<void>;
  stopSession: (sessionKey: string) => Promise<void>;
};

export type AcpRuntimeBackend = {
  id: string;
  runtime: AcpRuntime;
  healthy?: () => boolean;
};

type AcpRuntimeRegistryGlobalState = {
  backendsById: Map<string, AcpRuntimeBackend>;
};

const ACP_RUNTIME_REGISTRY_STATE_KEY = Symbol.for("cross-wms.acpRuntimeRegistryState");

function resolveAcpRuntimeRegistryGlobalState(): AcpRuntimeRegistryGlobalState {
  const processStore = process as NodeJS.Process & Record<PropertyKey, unknown>;
  const existing = processStore[ACP_RUNTIME_REGISTRY_STATE_KEY];
  if (existing) {
    return existing as AcpRuntimeRegistryGlobalState;
  }
  const created: AcpRuntimeRegistryGlobalState = {
    backendsById: new Map<string, AcpRuntimeBackend>(),
  };
  processStore[ACP_RUNTIME_REGISTRY_STATE_KEY] = created;
  return created;
}

const ACP_BACKENDS_BY_ID = resolveAcpRuntimeRegistryGlobalState().backendsById;

function isBackendHealthy(backend: AcpRuntimeBackend): boolean {
  if (!backend.healthy) {
    return true;
  }
  try {
    return backend.healthy();
  } catch {
    return false;
  }
}

export function registerAcpRuntimeBackend(backend: AcpRuntimeBackend): void {
  const id = backend.id.toLowerCase().trim();
  if (!id) {
    throw new Error("ACP runtime backend id is required");
  }
  if (!backend.runtime) {
    throw new Error(`ACP runtime backend "${id}" is missing runtime implementation`);
  }
  ACP_BACKENDS_BY_ID.set(id, {
    ...backend,
    id,
  });
}

export function unregisterAcpRuntimeBackend(id: string): void {
  const normalized = id.toLowerCase().trim();
  if (!normalized) {
    return;
  }
  ACP_BACKENDS_BY_ID.delete(normalized);
}

export function getAcpRuntimeBackend(id?: string): AcpRuntimeBackend | null {
  const normalized = id?.toLowerCase().trim() || "";
  if (normalized) {
    return ACP_BACKENDS_BY_ID.get(normalized) ?? null;
  }
  if (ACP_BACKENDS_BY_ID.size === 0) {
    return null;
  }
  for (const backend of ACP_BACKENDS_BY_ID.values()) {
    if (isBackendHealthy(backend)) {
      return backend;
    }
  }
  return ACP_BACKENDS_BY_ID.values().next().value ?? null;
}

export function requireAcpRuntimeBackend(id?: string): AcpRuntimeBackend {
  const normalized = id?.toLowerCase().trim() || "";
  const backend = getAcpRuntimeBackend(normalized || undefined);
  if (!backend) {
    throw new AcpRuntimeError(
      "ACP_BACKEND_MISSING",
      "ACP runtime backend is not configured.",
    );
  }
  if (!isBackendHealthy(backend)) {
    throw new AcpRuntimeError(
      "ACP_BACKEND_UNAVAILABLE",
      "ACP runtime backend is currently unavailable.",
    );
  }
  if (normalized && backend.id !== normalized) {
    throw new AcpRuntimeError(
      "ACP_BACKEND_MISSING",
      `ACP runtime backend "${normalized}" is not registered.`,
    );
  }
  return backend;
}

export class AcpRuntimeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AcpRuntimeError";
  }
}

export const testing = {
  resetAcpRuntimeBackendsForTests() {
    ACP_BACKENDS_BY_ID.clear();
  },
};
export { testing as __testing };