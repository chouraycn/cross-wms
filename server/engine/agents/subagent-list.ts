/**
 * 移植自 openclaw/src/agents/subagent-list.ts
 *
 * Subagent list builder.
 * Combines live registry runs and persisted session metadata for sessions_list/subagents views.
 * cross-wms 简化实现：提供基本的子代理列表构建。
 */

export type SubagentRunRecord = {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  controllerSessionKey: string;
  task: string;
  taskName?: string;
  model?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  outcome?: { status: string };
  spawnMode?: "run" | "session";
};

type SubagentListItem = {
  index: number;
  line: string;
  runId: string;
  sessionKey: string;
  taskName?: string;
  label: string;
  task: string;
  status: string;
  pendingDescendants: number;
  runtime: string;
  runtimeMs: number;
  model?: string;
};

type BuiltSubagentList = {
  total: number;
  active: SubagentListItem[];
  recent: SubagentListItem[];
  text: string;
};

function isLiveRun(entry: SubagentRunRecord): boolean {
  return !entry.endedAt && !entry.outcome;
}

function resolveRunStatus(entry: SubagentRunRecord): string {
  if (!entry.endedAt) {
    return "running";
  }
  const status = entry.outcome?.status ?? "done";
  if (status === "ok") return "done";
  if (status === "error") return "failed";
  return status;
}

function truncateLine(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "…";
}

function formatDurationCompact(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes}m`;
}

/** Build structured and text views for active and recent subagent runs. */
export function buildSubagentList(params: {
  runs: SubagentRunRecord[];
  recentMinutes: number;
  taskMaxChars?: number;
}): BuiltSubagentList {
  const now = Date.now();
  const recentCutoff = now - params.recentMinutes * 60_000;
  const dedupedRuns: SubagentRunRecord[] = [];
  const seenChildSessionKeys = new Set<string>();

  for (const entry of params.runs) {
    if (seenChildSessionKeys.has(entry.childSessionKey)) {
      continue;
    }
    seenChildSessionKeys.add(entry.childSessionKey);
    dedupedRuns.push(entry);
  }

  let index = 1;
  const buildListEntry = (entry: SubagentRunRecord) => {
    const runtimeMs = entry.endedAt
      ? entry.endedAt - (entry.startedAt ?? entry.createdAt)
      : now - (entry.startedAt ?? entry.createdAt);
    const status = resolveRunStatus(entry);
    const label = truncateLine(entry.taskName ?? entry.task.slice(0, 48), 48);
    const task = truncateLine(entry.task.trim(), params.taskMaxChars ?? 72);
    const taskNamePrefix = entry.taskName ? `${entry.taskName}: ` : "";
    const runtime = formatDurationCompact(Math.max(0, runtimeMs));
    const line = `${index}. ${taskNamePrefix}${label} (${entry.model ?? "unknown"}, ${runtime}) ${status}`;
    const view: SubagentListItem = {
      index,
      line,
      runId: entry.runId,
      sessionKey: entry.childSessionKey,
      ...(entry.taskName ? { taskName: entry.taskName } : {}),
      label,
      task,
      status,
      pendingDescendants: 0,
      runtime,
      runtimeMs,
      model: entry.model,
    };
    index += 1;
    return view;
  };

  const active = dedupedRuns
    .filter((entry) => isLiveRun(entry))
    .map(buildListEntry);

  const recent = dedupedRuns
    .filter((entry) => !isLiveRun(entry) && Boolean(entry.endedAt) && (entry.endedAt ?? 0) >= recentCutoff)
    .map(buildListEntry);

  const lines: string[] = [];
  lines.push("active subagents:");
  if (active.length === 0) {
    lines.push("(none)");
  } else {
    lines.push(...active.map((entry) => entry.line));
  }
  lines.push("");
  lines.push(`recent (last ${params.recentMinutes}m):`);
  if (recent.length === 0) {
    lines.push("(none)");
  } else {
    lines.push(...recent.map((entry) => entry.line));
  }

  return {
    total: dedupedRuns.length,
    active,
    recent,
    text: lines.join("\n"),
  };
}

/** Build child-session indexes from the latest run associated with each child key. */
export function buildLatestSubagentRunIndex(runs: SubagentRunRecord[]) {
  const latestByChildSessionKey = new Map<string, SubagentRunRecord>();
  for (const entry of runs) {
    const childSessionKey = entry.childSessionKey?.trim();
    if (!childSessionKey) continue;
    const existing = latestByChildSessionKey.get(childSessionKey);
    if (!existing || entry.createdAt > existing.createdAt) {
      latestByChildSessionKey.set(childSessionKey, entry);
    }
  }
  const childSessionsByController = new Map<string, string[]>();
  for (const [childSessionKey, entry] of latestByChildSessionKey.entries()) {
    const controllerSessionKey = entry.controllerSessionKey?.trim() || entry.requesterSessionKey?.trim();
    if (!controllerSessionKey) continue;
    const existing = childSessionsByController.get(controllerSessionKey);
    if (existing) {
      existing.push(childSessionKey);
      continue;
    }
    childSessionsByController.set(controllerSessionKey, [childSessionKey]);
  }
  for (const [controllerSessionKey, childSessions] of childSessionsByController) {
    childSessionsByController.set(controllerSessionKey, childSessions.toSorted());
  }
  return { latestByChildSessionKey, childSessionsByController };
}
