/**
 * 分离式 macOS launchd 重启切换，用于从服务内部重启。
 */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { resolveLaunchAgentLabel } from "./constants.js";
import { isCurrentProcessLaunchdServiceLabel } from "./launchd-current-service.js";
import { renderPosixRestartLogSetup } from "./restart-logs.js";

export { isCurrentProcessLaunchdServiceLabel };

type LaunchdRestartHandoffMode = "kickstart" | "reload" | "start-after-exit";

type LaunchdRestartHandoffResult = {
  ok: boolean;
  pid?: number;
  detail?: string;
};

type LaunchdRestartTarget = {
  domain: string;
  label: string;
  plistPath: string;
  serviceTarget: string;
};

const START_AFTER_EXIT_PRINT_RETRY_COUNT = 15;
const START_AFTER_EXIT_PRINT_RETRY_DELAY_SECONDS = 0.2;

type LaunchdRestartLogEnv = {
  HOME?: string;
  USERPROFILE?: string;
  CDF_STATE_DIR?: string;
  CROSS_WMS_PROFILE?: string;
};

function assertValidLaunchAgentLabel(label: string): string {
  const trimmed = label.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error(`Invalid launchd label: ${trimmed}`);
  }
  return trimmed;
}

function resolveGuiDomain(): string {
  if (typeof process.getuid !== "function") {
    return "gui/501";
  }
  return `gui/${process.getuid()}`;
}

function collectRestartLogEnv(env?: Record<string, string | undefined>): LaunchdRestartLogEnv {
  const source = { ...process.env, ...env };
  return {
    HOME: source.HOME,
    USERPROFILE: source.USERPROFILE,
    CDF_STATE_DIR: source.CDF_STATE_DIR,
    CROSS_WMS_PROFILE: source.CROSS_WMS_PROFILE,
  };
}

function resolveLaunchLabel(env?: Record<string, string | undefined>): string {
  const envLabel = env?.CROSS_WMS_LAUNCHD_LABEL?.trim();
  if (envLabel) {
    return assertValidLaunchAgentLabel(envLabel);
  }
  return assertValidLaunchAgentLabel(resolveLaunchAgentLabel(env?.CROSS_WMS_PROFILE));
}

function resolveLaunchdRestartTarget(
  env: Record<string, string | undefined> = process.env,
): LaunchdRestartTarget {
  const domain = resolveGuiDomain();
  const label = resolveLaunchLabel(env);
  const home = env.HOME || os.homedir();
  const plistPath = path.join(home, "Library", "LaunchAgents", `${label}.plist`);
  return {
    domain,
    label,
    plistPath,
    serviceTarget: `${domain}/${label}`,
  };
}

function buildLaunchdRestartScript(
  mode: LaunchdRestartHandoffMode,
  restartLogEnv: LaunchdRestartLogEnv,
): string {
  const waitForCallerPid = `wait_pid="$4"
label="$5"
${renderPosixRestartLogSetup(restartLogEnv)}
printf '[%s] cross-wms restart attempt source=launchd-handoff mode=${mode} target=%s waitPid=%s\\n' "$(date -u +%FT%TZ)" "$service_target" "$wait_pid" >&2
if [ -n "$wait_pid" ] && [ "$wait_pid" -gt 1 ] 2>/dev/null; then
  while kill -0 "$wait_pid" >/dev/null 2>&1; do
    sleep 0.1
  done
fi
`;

  if (mode === "kickstart") {
    return `service_target="$1"
domain="$2"
plist_path="$3"
${waitForCallerPid}
status=0
launchctl enable "$service_target"
if launchctl kickstart -k "$service_target"; then
  status=0
else
  status=$?
  if launchctl bootstrap "$domain" "$plist_path"; then
    status=0
  else
    launchctl kickstart -k "$service_target"
    status=$?
  fi
fi
if [ "$status" -eq 0 ]; then
  printf '[%s] cross-wms restart done source=launchd-handoff mode=${mode}\\n' "$(date -u +%FT%TZ)" >&2
else
  printf '[%s] cross-wms restart failed source=launchd-handoff mode=${mode} status=%s\\n' "$(date -u +%FT%TZ)" "$status" >&2
fi
exit "$status"
`;
  }

  if (mode === "reload") {
    const bootoutWaitLoop = `bootout_wait_count="${START_AFTER_EXIT_PRINT_RETRY_COUNT}"
while [ "$bootout_wait_count" -gt 0 ]; do
  if ! launchctl print "$service_target" >/dev/null 2>&1; then
    break
  fi
  bootout_wait_count=$((bootout_wait_count - 1))
  sleep ${START_AFTER_EXIT_PRINT_RETRY_DELAY_SECONDS}
done
`;
    return `service_target="$1"
domain="$2"
plist_path="$3"
${waitForCallerPid}
status=0
launchctl enable "$service_target"
launchctl bootout "$service_target" >/dev/null 2>&1 || true
${bootoutWaitLoop}
if launchctl bootstrap "$domain" "$plist_path"; then
  status=0
else
  status=$?
  launchctl kickstart -k "$service_target"
  status=$?
fi
if [ "$status" -eq 0 ]; then
  printf '[%s] cross-wms restart done source=launchd-handoff mode=${mode}\\n' "$(date -u +%FT%TZ)" >&2
else
  printf '[%s] cross-wms restart failed source=launchd-handoff mode=${mode} status=%s\\n' "$(date -u +%FT%TZ)" "$status" >&2
fi
exit "$status"
`;
  }

  const verifyLaunchdReload = `print_retry_count="${START_AFTER_EXIT_PRINT_RETRY_COUNT}"
while [ "$print_retry_count" -gt 0 ]; do
  if launchctl print "$service_target" >/dev/null 2>&1; then
    printf '[%s] cross-wms restart done source=launchd-handoff mode=${mode} reason=launchd-auto-reload\\n' "$(date -u +%FT%TZ)" >&2
    exit 0
  fi
  print_retry_count=$((print_retry_count - 1))
  sleep ${START_AFTER_EXIT_PRINT_RETRY_DELAY_SECONDS}
done
`;

  return `service_target="$1"
domain="$2"
plist_path="$3"
${waitForCallerPid}
${verifyLaunchdReload}
status=0
launchctl enable "$service_target"
if launchctl bootstrap "$domain" "$plist_path"; then
  status=0
else
  status=$?
  launchctl kickstart -k "$service_target"
  status=$?
fi
if [ "$status" -eq 0 ]; then
  printf '[%s] cross-wms restart done source=launchd-handoff mode=${mode}\\n' "$(date -u +%FT%TZ)" >&2
else
  printf '[%s] cross-wms restart failed source=launchd-handoff mode=${mode} status=%s\\n' "$(date -u +%FT%TZ)" "$status" >&2
fi
exit "$status"
`;
}

export function scheduleDetachedLaunchdRestartHandoff(params: {
  env?: Record<string, string | undefined>;
  mode: LaunchdRestartHandoffMode;
  waitForPid?: number;
}): LaunchdRestartHandoffResult {
  const target = resolveLaunchdRestartTarget(params.env);
  const waitForPid =
    typeof params.waitForPid === "number" && Number.isFinite(params.waitForPid)
      ? Math.floor(params.waitForPid)
      : 0;
  const restartLogEnv = collectRestartLogEnv(params.env);
  const restartEnv = { ...process.env, ...params.env };

  try {
    const child = spawn(
      "/bin/sh",
      [
        "-c",
        buildLaunchdRestartScript(params.mode, restartLogEnv),
        "cross-wms-launchd-restart-handoff",
        target.serviceTarget,
        target.domain,
        target.plistPath,
        String(waitForPid),
        target.label,
      ],
      {
        detached: true,
        stdio: "ignore",
        env: restartEnv,
      },
    );
    child.unref();
    return { ok: true, pid: child.pid ?? undefined };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
