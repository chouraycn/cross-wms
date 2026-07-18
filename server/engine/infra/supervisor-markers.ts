// 定义进程管理器标记标签用于 gateway 诊断。
// 降级实现：从 openclaw/src/infra/supervisor-markers.ts 移植，
// 由于 cross-wms 未移植 ../daemon/constants.js，本地提供 GATEWAY_LAUNCH_AGENT_LABEL 和 resolveGatewayLaunchAgentLabel 的降级 stub。

/**
 * Gateway launch agent 标签（降级 stub）。
 * openclaw 的 ../daemon/constants.js 导出此常量，cross-wms 未移植 daemon 模块。
 */
export const GATEWAY_LAUNCH_AGENT_LABEL = "com.openclaw.gateway";

/**
 * 解析 gateway launch agent 标签（降级 stub）。
 * openclaw 的 ../daemon/constants.js 导出此函数，cross-wms 未移植 daemon 模块。
 */
export function resolveGatewayLaunchAgentLabel(profile?: string): string {
  if (profile && profile.trim()) {
    return `com.openclaw.gateway.${profile.trim()}`;
  }
  return GATEWAY_LAUNCH_AGENT_LABEL;
}

const SUPERVISOR_HINTS = {
  launchd: ["OPENCLAW_LAUNCHD_LABEL"],
  systemd: ["OPENCLAW_SYSTEMD_UNIT", "INVOCATION_ID", "SYSTEMD_EXEC_PID", "JOURNAL_STREAM"],
  schtasks: ["OPENCLAW_WINDOWS_TASK_NAME"],
} as const;

/** 暗示 gateway 进程由外部 respawner 管理的环境键。 */
export const SUPERVISOR_HINT_ENV_VARS = [
  "LAUNCH_JOB_LABEL",
  "LAUNCH_JOB_NAME",
  "XPC_SERVICE_NAME",
  ...SUPERVISOR_HINTS.launchd,
  ...SUPERVISOR_HINTS.systemd,
  ...SUPERVISOR_HINTS.schtasks,
  "OPENCLAW_SERVICE_MARKER",
  "OPENCLAW_SERVICE_KIND",
] as const;

/** 可以在更新/重启交接后 respawn gateway 的受支持管理器 family。 */
export type RespawnSupervisor = "launchd" | "systemd" | "schtasks";

export interface DetectRespawnSupervisorOptions {
  includeLinuxOpenClawGatewayServiceMarker?: boolean;
}

function hasAnyHint(env: NodeJS.ProcessEnv, keys: readonly string[]): boolean {
  return keys.some((key) => {
    const value = env[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function hasOpenClawGatewayServiceMarker(env: NodeJS.ProcessEnv): boolean {
  return (
    env.OPENCLAW_SERVICE_MARKER?.trim() === "openclaw" &&
    env.OPENCLAW_SERVICE_KIND?.trim() === "gateway"
  );
}

function isCurrentGatewayLaunchdJob(env: NodeJS.ProcessEnv): boolean {
  const expectedLabel = resolveGatewayLaunchAgentLabel(env.OPENCLAW_PROFILE);
  if (
    [env.LAUNCH_JOB_LABEL, env.LAUNCH_JOB_NAME].some((value) => value?.trim() === expectedLabel)
  ) {
    return true;
  }
  return env.XPC_SERVICE_NAME?.trim() === GATEWAY_LAUNCH_AGENT_LABEL;
}

/** 从进程环境提示检测当前平台管理器。 */
export function detectRespawnSupervisor(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  options: DetectRespawnSupervisorOptions = {},
): RespawnSupervisor | null {
  if (platform === "darwin") {
    return hasAnyHint(env, SUPERVISOR_HINTS.launchd) || isCurrentGatewayLaunchdJob(env)
      ? "launchd"
      : null;
  }
  if (platform === "linux") {
    return hasAnyHint(env, SUPERVISOR_HINTS.systemd) ||
      (options.includeLinuxOpenClawGatewayServiceMarker === true &&
        hasOpenClawGatewayServiceMarker(env))
      ? "systemd"
      : null;
  }
  if (platform === "win32") {
    if (hasAnyHint(env, SUPERVISOR_HINTS.schtasks)) {
      return "schtasks";
    }
    const marker = env.OPENCLAW_SERVICE_MARKER?.trim();
    const serviceKind = env.OPENCLAW_SERVICE_KIND?.trim();
    return marker && serviceKind === "gateway" ? "schtasks" : null;
  }
  return null;
}
