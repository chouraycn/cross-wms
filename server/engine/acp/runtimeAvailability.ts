/**
 * ACP Runtime Availability
 * 运行时可用性检查 - 判断 ACP runtime spawning 是否可用
 *
 * 参考 openclaw/src/acp/runtime/availability.ts 设计
 */

import { isAcpEnabledByPolicy } from "./policy.js";
import { getAcpRuntimeBackend } from "./runtimeRegistry.js";

export function isAcpRuntimeSpawnAvailable(params: {
  config?: { acp?: { enabled?: boolean; dispatch?: { enabled?: boolean }; backend?: string } };
  sandboxed?: boolean;
  backendId?: string;
}): boolean {
  if (params.sandboxed === true) {
    return false;
  }
  if (params.config && !isAcpEnabledByPolicy(params.config.acp ?? {})) {
    return false;
  }
  const backend = getAcpRuntimeBackend(params.backendId ?? params.config?.acp?.backend);
  if (!backend) {
    return false;
  }
  if (!backend.healthy) {
    return true;
  }
  try {
    return backend.healthy();
  } catch {
    return false;
  }
}