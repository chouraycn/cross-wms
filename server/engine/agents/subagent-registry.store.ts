/**
 * 移植自 openclaw/src/agents/subagent-registry.store.ts
 *
 * JSON-backed subagent registry store.
 * cross-wms 简化实现：基于内存的注册表存储，带基本的读写接口。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
  runTimeoutSeconds?: number;
  outcome?: { status: string };
  requesterOrigin?: unknown;
  spawnMode?: "run" | "session";
  cleanupCompletedAt?: number;
  cleanupHandled?: boolean;
};

type PersistedSubagentRegistry = {
  version: 2;
  runs: Record<string, SubagentRunRecord>;
};

const REGISTRY_VERSION = 2 as const;

function resolveSubagentStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OPENCLAW_STATE_DIR?.trim();
  if (explicit) {
    return explicit;
  }
  if (env.VITEST || env.NODE_ENV === "test") {
    return path.join(os.tmpdir(), "openclaw-test-state", String(process.pid));
  }
  return path.join(os.homedir(), ".openclaw");
}

export function resolveSubagentRegistryPath(): string {
  return path.join(resolveSubagentStateDir(), "subagents", "runs.json");
}

export function loadSubagentRegistryFromDisk(): Map<string, SubagentRunRecord> {
  const pathname = resolveSubagentRegistryPath();
  try {
    if (!fs.existsSync(pathname)) {
      return new Map();
    }
    const content = fs.readFileSync(pathname, "utf-8");
    const raw = JSON.parse(content) as PersistedSubagentRegistry;
    if (raw.version !== REGISTRY_VERSION || !raw.runs || typeof raw.runs !== "object") {
      return new Map();
    }
    const out = new Map<string, SubagentRunRecord>();
    for (const [runId, entry] of Object.entries(raw.runs)) {
      if (entry && typeof entry === "object" && typeof entry.runId === "string") {
        out.set(runId, entry as SubagentRunRecord);
      }
    }
    return out;
  } catch {
    return new Map();
  }
}

export function saveSubagentRegistryToDisk(runs: Map<string, SubagentRunRecord>): void {
  const pathname = resolveSubagentRegistryPath();
  const serialized: Record<string, SubagentRunRecord> = {};
  for (const [runId, entry] of runs.entries()) {
    serialized[runId] = structuredClone(entry);
  }
  const out: PersistedSubagentRegistry = {
    version: REGISTRY_VERSION,
    runs: serialized,
  };
  const dir = path.dirname(pathname);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(pathname, JSON.stringify(out, null, 2), "utf-8");
}
