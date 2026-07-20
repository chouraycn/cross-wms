/**
 * Subagent registry completion tracking.
 * Ported from openclaw/src/agents/subagent-registry-completion.ts
 *
 * Note: Full subagent infrastructure not available in cross-wms.
 */

type SubagentHandle = {
  subagentId: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
};

type SubagentCompletionObserver = {
  add: (handle: SubagentHandle) => void;
  remove: (subagentId: string) => void;
  waitForCompletion: (subagentId: string, timeoutMs?: number) => Promise<SubagentHandle | undefined>;
  getPendingCount: () => number;
  getAll: () => SubagentHandle[];
};

/** Create a completion tracker for subagent invocations. */
export function createSubagentCompletionObserver(): SubagentCompletionObserver {
  const handles = new Map<string, SubagentHandle>();
  const resolvers = new Map<string, Array<(handle: SubagentHandle | undefined) => void>>();

  const add = (handle: SubagentHandle): void => {
    handles.set(handle.subagentId, handle);
    if (handle.status === "completed" || handle.status === "failed") {
      const pending = resolvers.get(handle.subagentId);
      if (pending) {
        resolvers.delete(handle.subagentId);
        for (const resolve of pending) {
          resolve(handle);
        }
      }
    }
  };

  const remove = (subagentId: string): void => {
    handles.delete(subagentId);
    const pending = resolvers.get(subagentId);
    if (pending) {
      resolvers.delete(subagentId);
      for (const resolve of pending) {
        resolve(undefined);
      }
    }
  };

  const waitForCompletion = async (
    subagentId: string,
    timeoutMs?: number,
  ): Promise<SubagentHandle | undefined> => {
    const existing = handles.get(subagentId);
    if (existing && (existing.status === "completed" || existing.status === "failed")) {
      return existing;
    }
    return new Promise<SubagentHandle | undefined>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          const list = resolvers.get(subagentId);
          if (list) {
            const idx = list.indexOf(resolve);
            if (idx >= 0) list.splice(idx, 1);
            if (list.length === 0) resolvers.delete(subagentId);
          }
          resolve(undefined);
        }, timeoutMs);
      }
      const wrappedResolve = (handle: SubagentHandle | undefined) => {
        if (timer) clearTimeout(timer);
        resolve(handle);
      };
      let list = resolvers.get(subagentId);
      if (!list) {
        list = [];
        resolvers.set(subagentId, list);
      }
      list.push(wrappedResolve);
    });
  };

  const getPendingCount = (): number => {
    let count = 0;
    for (const handle of handles.values()) {
      if (handle.status === "pending" || handle.status === "running") {
        count++;
      }
    }
    return count;
  };

  const getAll = (): SubagentHandle[] => [...handles.values()];

  return { add, remove, waitForCompletion, getPendingCount, getAll };
}

/** Wait for all tracked subagents to reach a terminal state. */
export async function waitForAllSubagentsComplete(
  observer: SubagentCompletionObserver,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<SubagentHandle[]> {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  while (observer.getPendingCount() > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return observer.getAll().filter((h) => h.status === "completed" || h.status === "failed");
}

/** Extract subagent results, returning only successfully completed handles. */
export function extractCompletedSubagentResults(
  handles: SubagentHandle[],
): Array<{ subagentId: string; result: unknown }> {
  return handles
    .filter((h) => h.status === "completed" && h.result !== undefined)
    .map((h) => ({ subagentId: h.subagentId, result: h.result }));
}
