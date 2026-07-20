/**
 * 移植自 openclaw/src/agents/tool-schema-quarantine-health.ts
 *
 * Persists runtime tool-schema quarantines in an in-memory store
 * so health surfaces can see failures from any live runtime process.
 */

type RuntimeToolSchemaQuarantine = {
  toolName: string;
  owner?: string;
  reason: string;
  failedAt: Date;
};

type PersistedRuntimeToolSchemaQuarantineRecord = {
  toolName: string;
  owner?: string;
  reason: string;
  failedAtMs: number;
  processId: number;
  processToken: string;
  processStartTime: number;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// In-memory store as cross-wms does not have the SQLite-backed runtime-health-store.
const quarantineRecords = new Map<string, PersistedRuntimeToolSchemaQuarantineRecord>();
const MAX_ENTRIES = 128;

function recordKey(
  record: Pick<PersistedRuntimeToolSchemaQuarantineRecord, "owner" | "toolName" | "processId">,
): string {
  return JSON.stringify([record.owner ?? "", record.toolName, record.processId]);
}

export type RuntimeToolSchemaQuarantineIdentity = {
  toolName: string;
  owner?: string;
};

function identityKey(identity: RuntimeToolSchemaQuarantineIdentity): string {
  return JSON.stringify([identity.owner ?? "", identity.toolName]);
}

// Keys this process has persisted.
const locallyPersistedKeys = new Set<string>();

export function recordPersistedRuntimeToolSchemaQuarantine(
  quarantine: RuntimeToolSchemaQuarantine,
): void {
  const record: PersistedRuntimeToolSchemaQuarantineRecord = {
    toolName: quarantine.toolName,
    reason: quarantine.reason,
    failedAtMs: quarantine.failedAt.getTime(),
    processId: process.pid,
    processToken: "cross-wms",
    processStartTime: Date.now(),
    ...(quarantine.owner ? { owner: quarantine.owner } : {}),
  };
  const key = recordKey(record);
  quarantineRecords.set(key, record);
  locallyPersistedKeys.add(identityKey(record));
  // Evict oldest entries if over limit
  if (quarantineRecords.size > MAX_ENTRIES) {
    const firstKey = quarantineRecords.keys().next().value;
    if (firstKey !== undefined) {
      quarantineRecords.delete(firstKey);
    }
  }
}

/**
 * Removes this process's persisted quarantines for tools that now validate
 * cleanly. `listHealthyTools` is only invoked when this process has persisted
 * quarantines, keeping the common per-run path free of work.
 */
export function clearRecoveredPersistedRuntimeToolSchemaQuarantines(
  listHealthyTools: () => readonly RuntimeToolSchemaQuarantineIdentity[],
): void {
  if (locallyPersistedKeys.size === 0) {
    return;
  }
  const recoveredKeys = new Set(
    listHealthyTools()
      .map(identityKey)
      .filter((key) => locallyPersistedKeys.has(key)),
  );
  if (recoveredKeys.size === 0) {
    return;
  }
  for (const [key, record] of quarantineRecords.entries()) {
    if (record.processId === process.pid && recoveredKeys.has(identityKey(record))) {
      quarantineRecords.delete(key);
    }
  }
  for (const key of recoveredKeys) {
    locallyPersistedKeys.delete(key);
  }
}

export function listPersistedRuntimeToolSchemaQuarantines(): RuntimeToolSchemaQuarantine[] {
  return Array.from(quarantineRecords.values()).map((record) => {
    const quarantine: RuntimeToolSchemaQuarantine = {
      toolName: record.toolName,
      reason: record.reason,
      failedAt: new Date(record.failedAtMs),
    };
    if (record.owner) {
      quarantine.owner = record.owner;
    }
    return quarantine;
  });
}
