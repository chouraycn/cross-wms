/**
 * 移植自 openclaw/src/agents/auth-profiles/sqlite.ts
 *
 * SQLite persistence adapter for auth profile secrets and runtime state.
 * Cross-wms simplified: uses filesystem-based JSON store instead of SQLite/Kysely.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const PRIMARY_ROW_KEY = "primary";

function resolveDefaultAgentDir(): string {
  return path.join(os.homedir(), ".openclaw", "agent");
}

function resolveAgentDir(agentDir?: string): string {
  return agentDir?.trim() ? path.resolve(agentDir) : resolveDefaultAgentDir();
}

function inferAgentIdFromDir(agentDir: string): string {
  const normalized = path.normalize(agentDir);
  if (path.basename(normalized) === "agent") {
    const parent = path.basename(path.dirname(normalized));
    if (parent) return parent;
  }
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `custom-${hash}`;
}

function resolveAuthProfileDatabasePathInternal(agentDir?: string): string {
  const dir = resolveAgentDir(agentDir);
  return path.join(dir, "auth-profile.json");
}

function parseJsonCell(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return null;
  try {
    return parseJsonCell(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

/** Resolves the database path that stores auth profiles for an agent dir. */
export function resolveAuthProfileDatabasePath(agentDir?: string): string {
  return resolveAuthProfileDatabasePathInternal(agentDir);
}

/** Resolves the database and sidecar paths used by auth profiles. */
export function resolveAuthProfileDatabaseFilePaths(agentDir?: string): string[] {
  return [resolveAuthProfileDatabasePathInternal(agentDir)];
}

/** Reads the raw persisted secrets-store payload. */
export function readPersistedAuthProfileStoreRaw(agentDir?: string): unknown {
  const dbPath = resolveAuthProfileDatabasePathInternal(agentDir);
  const data = readJsonFile(dbPath);
  if (!data || typeof data !== "object") return null;
  return (data as Record<string, unknown>)["store"] ?? null;
}

/** Reads the raw persisted runtime-state payload. */
export function readPersistedAuthProfileStateRaw(agentDir?: string): unknown {
  const dbPath = resolveAuthProfileDatabasePathInternal(agentDir);
  const data = readJsonFile(dbPath);
  if (!data || typeof data !== "object") return null;
  return (data as Record<string, unknown>)["state"] ?? null;
}

/** Writes the raw persisted secrets-store payload. */
export function writePersistedAuthProfileStoreRaw(payload: unknown, agentDir?: string): void {
  const dbPath = resolveAuthProfileDatabasePathInternal(agentDir);
  const existing = (readJsonFile(dbPath) as Record<string, unknown>) ?? {};
  existing["store"] = payload;
  existing["updatedAt"] = Date.now();
  writeJsonFile(dbPath, existing);
}

/** Deletes the persisted secrets-store row while leaving runtime state intact. */
export function deletePersistedAuthProfileStoreRaw(agentDir?: string): void {
  const dbPath = resolveAuthProfileDatabasePathInternal(agentDir);
  const existing = readJsonFile(dbPath) as Record<string, unknown> | null;
  if (!existing) return;
  delete existing["store"];
  writeJsonFile(dbPath, existing);
}

/** Writes or deletes the persisted runtime-state payload. */
export function writePersistedAuthProfileStateRaw(payload: unknown, agentDir?: string): void {
  const dbPath = resolveAuthProfileDatabasePathInternal(agentDir);
  const existing = (readJsonFile(dbPath) as Record<string, unknown>) ?? {};
  if (!payload) {
    delete existing["state"];
  } else {
    existing["state"] = payload;
  }
  existing["updatedAt"] = Date.now();
  writeJsonFile(dbPath, existing);
}

/** Runs an auth-profile database write transaction for store/state updates. */
export function runAuthProfileWriteTransaction<T>(
  agentDir: string | undefined,
  operation: (context: { dir: string }) => T,
): T {
  const dir = resolveAgentDir(agentDir);
  return operation({ dir });
}
