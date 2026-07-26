// Legacy message queue config migrations for retired steering modes.
// 移植自 openclaw/src/commands/doctor/shared/legacy-config-migrations.queue.ts
//
// 降级说明：
//  - LegacyConfigMigrationSpec / LegacyConfigRule / defineLegacyConfigMigration / getRecord
//    来自 ../../../config/legacy.shared.js → cross-wms 占位为 unknown，
//    在本文件内提供本地等价类型与 identity 帮助器以保留原迁移逻辑
//  - isRecord 来自 ./legacy-config-record-shared.js → cross-wms 已移植
import { isRecord, type JsonRecord } from "./legacy-config-record-shared.js";

export type LegacyConfigRule = {
  path: string[];
  message: string;
  match?: (value: unknown, root: JsonRecord) => boolean;
  requireSourceLiteral?: boolean;
};

export type LegacyConfigMigration = {
  id: string;
  describe: string;
  apply: (raw: JsonRecord, changes: string[]) => void;
};

export type LegacyConfigMigrationSpec = LegacyConfigMigration & {
  legacyRules?: LegacyConfigRule[];
};

/** Identity helper that preserves the LegacyConfigMigrationSpec shape for migration registries. */
export function defineLegacyConfigMigration(
  migration: LegacyConfigMigrationSpec,
): LegacyConfigMigrationSpec {
  return migration;
}

/** Returns the value as a non-array record or null. */
function getRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

const RETIRED_QUEUE_MODES = new Set(["queue", "steer-backlog", "steer+backlog"]);

function isRetiredQueueMode(value: unknown): value is string {
  return typeof value === "string" && RETIRED_QUEUE_MODES.has(value);
}

function hasRetiredQueueModeByChannel(value: unknown): boolean {
  const byChannel = getRecord(value);
  return Boolean(byChannel && Object.values(byChannel).some(isRetiredQueueMode));
}

function migrateQueueMode(params: {
  owner: JsonRecord;
  key: string;
  path: string;
  changes: string[];
}): boolean {
  const value = params.owner[params.key];
  if (!isRetiredQueueMode(value)) {
    return false;
  }
  const replacement = value === "queue" ? "steer" : "followup";
  params.owner[params.key] = replacement;
  params.changes.push(
    `Moved deprecated ${params.path} "${value}" → "${replacement}"; use "steer" for default active-run steering.`,
  );
  return true;
}

const QUEUE_MODE_RULES: LegacyConfigRule[] = [
  {
    path: ["messages", "queue", "mode"],
    message:
      'messages.queue.mode uses a retired queue mode; use steer, followup, collect, or interrupt. Run "openclaw doctor --fix".',
    match: isRetiredQueueMode,
  },
  {
    path: ["messages", "queue", "byChannel"],
    message:
      'messages.queue.byChannel contains a retired queue mode; use steer, followup, collect, or interrupt. Run "openclaw doctor --fix".',
    match: hasRetiredQueueModeByChannel,
  },
];

/** Legacy config migration specs for message queue mode compatibility. */
export const LEGACY_CONFIG_MIGRATIONS_QUEUE: LegacyConfigMigrationSpec[] = [
  defineLegacyConfigMigration({
    id: "messages.queue.retired-steering-modes",
    describe: "Move retired messages.queue modes to followup mode",
    legacyRules: QUEUE_MODE_RULES,
    apply: (raw, changes) => {
      const queue = getRecord(getRecord(raw.messages)?.queue);
      if (!queue) {
        return;
      }

      migrateQueueMode({
        owner: queue,
        key: "mode",
        path: "messages.queue.mode",
        changes,
      });

      const byChannel = getRecord(queue.byChannel);
      if (byChannel) {
        for (const [channelId, _value] of Object.entries(byChannel)) {
          migrateQueueMode({
            owner: byChannel,
            key: channelId,
            path: `messages.queue.byChannel.${channelId}`,
            changes,
          });
        }
        queue.byChannel = byChannel;
      }
    },
  }),
];
