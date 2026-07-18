/**
 * 运行时状态格式化。
 */
import type { GatewayServiceRuntime } from "./service-runtime.js";

const SIGNAL_NAMES_BY_STATUS = new Map<number, string>([
  [129, "SIGHUP"],
  [130, "SIGINT"],
  [131, "SIGQUIT"],
  [134, "SIGABRT/abort"],
  [137, "SIGKILL"],
  [143, "SIGTERM"],
]);

function formatLastExitStatus(status: number): string {
  const signalName = SIGNAL_NAMES_BY_STATUS.get(status);
  return signalName ? `last exit ${status} (${signalName})` : `last exit ${status}`;
}

export function formatRuntimeStatus(runtime: GatewayServiceRuntime | undefined): string | null {
  if (!runtime) {
    return null;
  }
  const details: string[] = [];
  if (runtime.subState) {
    details.push(`sub ${runtime.subState}`);
  }
  if (runtime.lastExitStatus !== undefined) {
    details.push(formatLastExitStatus(runtime.lastExitStatus));
  }
  if (runtime.lastExitReason) {
    details.push(`reason ${runtime.lastExitReason}`);
  }
  if (runtime.lastRunResult) {
    details.push(`last run ${runtime.lastRunResult}`);
  }
  if (runtime.lastRunTime) {
    details.push(`last run time ${runtime.lastRunTime}`);
  }
  if (runtime.detail) {
    details.push(runtime.detail);
  }

  const status = runtime.status || runtime.state || "unknown";
  const pidStr = runtime.pid ? `pid=${runtime.pid}` : "";
  const detailsStr = details.length > 0 ? ` (${details.join(", ")})` : "";

  return `${status}${pidStr ? " " + pidStr : ""}${detailsStr}`;
}

export function formatRuntimeStatusWithDetails(params: {
  status?: string;
  pid?: number;
  state?: string;
  details: string[];
}): string {
  const status = params.status || params.state || "unknown";
  const pidStr = params.pid ? `pid=${params.pid}` : "";
  const detailsStr = params.details.length > 0 ? ` (${params.details.join(", ")})` : "";
  return `${status}${pidStr ? " " + pidStr : ""}${detailsStr}`;
}
