// 当没有管理器处理重启时重新生成网关进程。
// 移植自 openclaw/src/infra/process-respawn.ts
//
// 降级说明：
//  - @openclaw/normalization-core/string-coerce → ./string-coerce.js
//  - triggerOpenClawRestart 来自 ./restart.js，cross-wms 未移植此函数，
//    本地降级 stub 返回失败
import { spawn, type ChildProcess } from "node:child_process";
import { normalizeOptionalLowercaseString } from "./string-coerce.js";
import { isContainerEnvironment } from "./container-environment.js";
import { formatErrorMessage } from "./errors.js";
import { detectRespawnSupervisor } from "./supervisor-markers.js";
import type { RestartAttempt } from "./restart.types.js";

// ============================================================================
// 降级 stub —— triggerOpenClawRestart（cross-wms 未移植完整 supervisor 重启逻辑）
// ============================================================================

/**
 * 触发 OpenClaw 重启（降级 stub）。
 * openclaw 的 ./restart.js 导出此函数，cross-wms 未移植完整的 supervisor 重启逻辑。
 * 降级为返回失败，调用方应回退到 in-process 重启。
 */
function triggerOpenClawRestart(): RestartAttempt {
  return {
    ok: false,
    method: "supervisor",
    detail: "triggerOpenClawRestart not implemented in cross-wms",
  };
}

// ============================================================================

type RespawnMode = "spawned" | "supervised" | "disabled" | "failed";

type GatewayRespawnResult = {
  mode: RespawnMode;
  pid?: number;
  detail?: string;
};

type GatewayUpdateRespawnResult = GatewayRespawnResult & {
  child?: ChildProcess;
};
type GatewayRespawnOptions = {
  env?: NodeJS.ProcessEnv;
};

function isTruthy(value: string | undefined): boolean {
  const normalized = normalizeOptionalLowercaseString(value);
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

const PNPM_VERSIONED_OPENCLAW_ENTRY_PATTERN =
  /^(.*?)([\\/])node_modules\2\.pnpm\2openclaw@[^\\/]+\2node_modules\2openclaw\2.+$/;

function rewritePnpmVersionedOpenClawEntryPath(entryPath: string): string {
  // pnpm can expose argv[1] as a versioned realpath that self-update removes.
  // Respawn through the stable OpenClaw package wrapper instead.
  return entryPath.replace(
    PNPM_VERSIONED_OPENCLAW_ENTRY_PATTERN,
    "$1$2node_modules$2openclaw$2openclaw.mjs",
  );
}

function spawnDetachedGatewayProcess(opts: GatewayRespawnOptions = {}): {
  child: ChildProcess;
  pid?: number;
} {
  const [entryArg, ...entryArgs] = process.argv.slice(1);
  const args = [
    ...process.execArgv,
    ...(entryArg ? [rewritePnpmVersionedOpenClawEntryPath(entryArg)] : []),
    ...entryArgs,
  ];
  const child = spawn(process.execPath, args, {
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    detached: true,
    stdio: "inherit",
  });
  child.unref();
  return { child, pid: child.pid ?? undefined };
}

/**
 * Attempt to restart this process with a fresh PID.
 * - supervised environments (launchd/systemd/schtasks): caller should exit and let supervisor restart
 * - OPENCLAW_NO_RESPAWN=1: caller should keep in-process restart behavior (tests/dev)
 * - unmanaged environments: caller should keep in-process restart behavior so
 *   custom supervisors keep tracking the same gateway PID
 */
export function restartGatewayProcessWithFreshPid(
  _opts: GatewayRespawnOptions = {},
): GatewayRespawnResult {
  if (isTruthy(process.env.OPENCLAW_NO_RESPAWN)) {
    return { mode: "disabled" };
  }
  const supervisor = detectRespawnSupervisor(process.env);
  if (supervisor) {
    // On macOS launchd, exit cleanly and let KeepAlive relaunch the service.
    // Avoid detached kickstart/start handoffs here so restart timing stays tied
    // to launchd's native supervision rather than a second helper process.
    if (supervisor === "schtasks") {
      const restart = triggerOpenClawRestart();
      if (!restart.ok) {
        return {
          mode: "failed",
          detail: restart.detail ?? `${restart.method} restart failed`,
        };
      }
    }
    return { mode: "supervised" };
  }
  if (process.platform === "win32") {
    // Detached respawn is unsafe on Windows without an identified Scheduled Task:
    // the child becomes orphaned if the original process exits.
    return {
      mode: "disabled",
      detail: "win32: detached respawn unsupported without Scheduled Task markers",
    };
  }
  if (isContainerEnvironment()) {
    return {
      mode: "disabled",
      detail: "container: use in-process restart to keep PID 1 alive",
    };
  }

  return {
    mode: "disabled",
    detail: "unmanaged: use in-process restart to keep custom supervisor PID tracking stable",
  };
}

/**
 * Update restarts must replace the OS process so the new code runs from a
 * fresh module graph after package files have changed on disk.
 *
 * Unlike the generic restart path, update mode allows detached respawn on
 * unmanaged Windows installs because there is no safe in-process fallback once
 * the installed package contents have been replaced.
 */
export function respawnGatewayProcessForUpdate(
  opts: GatewayRespawnOptions = {},
): GatewayUpdateRespawnResult {
  if (isTruthy(process.env.OPENCLAW_NO_RESPAWN)) {
    return { mode: "disabled", detail: "OPENCLAW_NO_RESPAWN" };
  }
  const supervisor = detectRespawnSupervisor(process.env, process.platform, {
    includeLinuxOpenClawGatewayServiceMarker: true,
  });
  if (supervisor) {
    if (supervisor === "schtasks") {
      const restart = triggerOpenClawRestart();
      if (!restart.ok) {
        return {
          mode: "failed",
          detail: restart.detail ?? `${restart.method} restart failed`,
        };
      }
    }
    return { mode: "supervised" };
  }
  try {
    const { child, pid } = spawnDetachedGatewayProcess(opts);
    return { mode: "spawned", pid, child };
  } catch (err) {
    return {
      mode: "failed",
      detail: formatErrorMessage(err),
    };
  }
}
