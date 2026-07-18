/**
 * Plugin session scheduled turns.
 *
 * 移植自 openclaw/src/plugins/host-hook-scheduled-turns.ts。
 * 降级策略：运行时函数降级为返回默认值。
 */

export function buildPluginSchedulerCronName(params: {
  pluginId: string;
  sessionId?: string;
  tag?: string;
}): string {
  return `${params.pluginId}:${params.sessionId ?? ""}:${params.tag ?? ""}`;
}

export async function schedulePluginSessionTurn(params: {
  sessionId: string;
  pluginId: string;
  cron?: string;
  delayMs?: number;
  tag?: string;
  payload?: unknown;
}): Promise<{ scheduled: boolean; jobId?: string }> {
  void params;
  return { scheduled: false };
}

export async function unschedulePluginSessionTurnsByTag(params: {
  sessionId: string;
  tag?: string;
  pluginId?: string;
}): Promise<{ unscheduled: number }> {
  void params;
  return { unscheduled: 0 };
}
