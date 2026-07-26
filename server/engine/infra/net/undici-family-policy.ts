// Undici address-family policy helpers centralize IPv4/IPv6 defaults for
// global dispatchers.
// 移植自 openclaw/src/infra/net/undici-family-policy.ts
// 降级：openclaw 版本依赖 ../wsl.js 的 isWSL2Sync()，cross-wms 未移植 wsl 检测，
// 因此 WSL2 强制 IPv4 的特化逻辑被省略，仅保留 autoSelectFamily 默认值解析。
import * as net from "node:net";

const AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS = 300;

/** Resolves the process default autoSelectFamily policy. */
export function resolveUndiciAutoSelectFamily(): boolean | undefined {
  if (typeof net.getDefaultAutoSelectFamily !== "function") {
    return undefined;
  }
  try {
    return net.getDefaultAutoSelectFamily();
  } catch {
    return undefined;
  }
}

/** Converts an autoSelectFamily decision into the undici connect option shape. */
export function createUndiciAutoSelectFamilyConnectOptions(
  autoSelectFamily: boolean | undefined,
): { autoSelectFamily: boolean; autoSelectFamilyAttemptTimeout: number } | undefined {
  if (autoSelectFamily === undefined) {
    return undefined;
  }
  return {
    autoSelectFamily,
    autoSelectFamilyAttemptTimeout: AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS,
  };
}

/** Returns shared undici connect options for dispatchers that do not override them. */
export function resolveUndiciAutoSelectFamilyConnectOptions():
  | { autoSelectFamily: boolean; autoSelectFamilyAttemptTimeout: number }
  | undefined {
  return createUndiciAutoSelectFamilyConnectOptions(resolveUndiciAutoSelectFamily());
}

/**
 * Temporarily applies an undici family decision around synchronous setup code.
 * Restore is best-effort because older Node runtimes may not expose the setters.
 */
export function withTemporaryUndiciAutoSelectFamily<T>(
  autoSelectFamily: boolean | undefined,
  run: () => T,
): T {
  if (
    autoSelectFamily === undefined ||
    typeof net.getDefaultAutoSelectFamily !== "function" ||
    typeof net.setDefaultAutoSelectFamily !== "function"
  ) {
    return run();
  }

  let previous: boolean;
  try {
    previous = net.getDefaultAutoSelectFamily();
    net.setDefaultAutoSelectFamily(autoSelectFamily);
  } catch {
    return run();
  }

  try {
    return run();
  } finally {
    try {
      net.setDefaultAutoSelectFamily(previous);
    } catch {
      // Best-effort restore; dispatcher setup is already best-effort.
    }
  }
}
