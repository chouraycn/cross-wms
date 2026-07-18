import { logger } from '../../logger.js';

export type SessionMigration = {
  id: string;
  name: string;
  description?: string;
  version: string;
  apply: (sessions: Record<string, unknown>) => Promise<Record<string, unknown>>;
  shouldRun?: (sessions: Record<string, unknown>) => boolean;
};

export type MigrationResult = {
  ok: boolean;
  appliedMigrations: string[];
  failedMigrations: Array<{ id: string; error: string }>;
  warnings: string[];
  durationMs: number;
};

const migrations = new Map<string, SessionMigration>();
const appliedMigrations = new Set<string>();

export function registerSessionMigration(migration: SessionMigration): void {
  migrations.set(migration.id, migration);
  logger.debug(`[Gateway] Registered session migration: ${migration.id} (v${migration.version})`);
}

export function unregisterSessionMigration(id: string): boolean {
  return migrations.delete(id);
}

export function getSessionMigrations(): SessionMigration[] {
  return Array.from(migrations.values());
}

export function isMigrationApplied(id: string): boolean {
  return appliedMigrations.has(id);
}

export function markMigrationApplied(id: string): void {
  appliedMigrations.add(id);
}

export function getPendingMigrations(
  sessions: Record<string, unknown>,
): SessionMigration[] {
  const pending: SessionMigration[] = [];
  for (const migration of migrations.values()) {
    if (appliedMigrations.has(migration.id)) continue;
    if (migration.shouldRun && !migration.shouldRun(sessions)) continue;
    pending.push(migration);
  }
  return pending.sort((a, b) => a.version.localeCompare(b.version));
}

export async function runSessionMigrations(
  sessions: Record<string, unknown>,
): Promise<MigrationResult> {
  const startTime = Date.now();
  const appliedMigrationsList: string[] = [];
  const failedMigrations: Array<{ id: string; error: string }> = [];
  const warnings: string[] = [];

  logger.info('[Gateway] Running session migrations...');

  let currentSessions = { ...sessions };
  const pending = getPendingMigrations(currentSessions);

  logger.debug(`[Gateway] Found ${pending.length} pending migrations`);

  for (const migration of pending) {
    logger.debug(`[Gateway] Applying migration: ${migration.id} (v${migration.version})`);

    try {
      const migrationStartTime = Date.now();
      currentSessions = await migration.apply(currentSessions);
      const migrationDuration = Date.now() - migrationStartTime;

      appliedMigrations.add(migration.id);
      appliedMigrationsList.push(migration.id);
      logger.debug(
        `[Gateway] Migration ${migration.id} applied in ${migrationDuration}ms`,
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      failedMigrations.push({ id: migration.id, error: errorMessage });
      logger.error(`[Gateway] Migration ${migration.id} failed:`, err);
    }
  }

  const totalDuration = Date.now() - startTime;
  const ok = failedMigrations.length === 0;

  logger.info(
    `[Gateway] Session migrations complete in ${totalDuration}ms (${appliedMigrationsList.length} applied, ${failedMigrations.length} failed)`,
  );

  return {
    ok,
    appliedMigrations: appliedMigrationsList,
    failedMigrations,
    warnings,
    durationMs: totalDuration,
  };
}

export function clearSessionMigrations(): void {
  migrations.clear();
  appliedMigrations.clear();
}

export function getMigrationStatus(): {
  total: number;
  applied: number;
  pending: number;
  failed: number;
} {
  const total = migrations.size;
  const applied = appliedMigrations.size;
  return {
    total,
    applied,
    pending: total - applied,
    failed: 0,
  };
}
