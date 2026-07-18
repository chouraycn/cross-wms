/** Normalizes accepted child-session spawn results from loose tool payloads. */
import { asOptionalRecord } from "../infra/record-coerce.js";
import { normalizeOptionalString } from "../infra/string-coerce.js";

// Helpers for recognizing accepted session-spawn tool results in loosely typed
// tool payloads and persisted delivery metadata.
export type AcceptedSessionSpawn = {
  runId: string;
  childSessionKey: string;
};

/** Normalize a tool result that accepted a child session spawn. */
export function normalizeAcceptedSessionSpawnResult(result: unknown): AcceptedSessionSpawn | null {
  const details = asOptionalRecord(asOptionalRecord(result)?.details);
  if (!details || details.status !== "accepted") {
    return null;
  }
  const runId = normalizeOptionalString(details.runId);
  const childSessionKey = normalizeOptionalString(details.childSessionKey);
  if (!runId || !childSessionKey) {
    return null;
  }
  return { runId, childSessionKey };
}

/** Return true when a collection contains at least one accepted child spawn. */
export function hasAcceptedSessionSpawn(acceptedSessionSpawns?: readonly unknown[]): boolean {
  return (acceptedSessionSpawns ?? []).some((spawn) => {
    const record = asOptionalRecord(spawn);
    if (!record) {
      return false;
    }
    return Boolean(
      normalizeOptionalString(record.runId) && normalizeOptionalString(record.childSessionKey),
    );
  });
}
