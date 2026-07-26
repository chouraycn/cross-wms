// Legacy audio config migrations for retired transcription command settings.
// 移植自 openclaw/src/commands/doctor/shared/legacy-config-migrations.audio.ts
//
// 降级说明：
//  - LegacyConfigMigrationSpec / defineLegacyConfigMigration / getRecord / ensureRecord
//    来自 ../../../config/legacy.shared.js → cross-wms 占位为 unknown，
//    在本文件内提供本地等价类型与 identity 帮助器以保留原迁移逻辑
//  - isSafeExecutableValue 来自 ../../../infra/exec-safety.js → cross-wms 已移植
//  - isRecord 来自 ./legacy-config-record-shared.js → cross-wms 已移植
import { isSafeExecutableValue } from "../../../infra/exec-safety.js";
import { ensureRecord, isRecord, type JsonRecord } from "./legacy-config-record-shared.js";

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

/** Maps a legacy audio.transcription command shape to a tools.media.audio.models entry. */
function mapLegacyAudioTranscription(value: unknown): JsonRecord | null {
  const transcriber = getRecord(value);
  const command = Array.isArray(transcriber?.command) ? transcriber?.command : null;
  if (!command || command.length === 0) {
    return null;
  }
  if (typeof command[0] !== "string") {
    return null;
  }
  if (!command.every((part) => typeof part === "string")) {
    return null;
  }
  const rawExecutable = command[0].trim();
  if (!rawExecutable) {
    return null;
  }
  if (!isSafeExecutableValue(rawExecutable)) {
    return null;
  }

  const args = command.slice(1).map((part) => part.replace(/\{input\}/g, "{{MediaPath}}"));
  const timeoutSeconds =
    typeof transcriber?.timeoutSeconds === "number" ? transcriber?.timeoutSeconds : undefined;

  const result: JsonRecord = { command: rawExecutable, type: "cli" };
  if (args.length > 0) {
    result.args = args;
  }
  if (timeoutSeconds !== undefined) {
    result.timeoutSeconds = timeoutSeconds;
  }
  return result;
}

function applyLegacyAudioTranscriptionModel(params: {
  raw: JsonRecord;
  source: unknown;
  changes: string[];
  movedMessage: string;
  alreadySetMessage: string;
  invalidMessage: string;
}) {
  const mapped = mapLegacyAudioTranscription(params.source);
  if (!mapped) {
    params.changes.push(params.invalidMessage);
    return;
  }
  const tools = ensureRecord(params.raw, "tools");
  const media = ensureRecord(tools, "media");
  const mediaAudio = ensureRecord(media, "audio");
  const models = Array.isArray(mediaAudio.models) ? (mediaAudio.models as unknown[]) : [];
  if (models.length === 0) {
    mediaAudio.enabled = true;
    mediaAudio.models = [mapped];
    params.changes.push(params.movedMessage);
    return;
  }
  params.changes.push(params.alreadySetMessage);
}

/** Legacy config migration specs for audio/tool media config. */
export const LEGACY_CONFIG_MIGRATIONS_AUDIO: LegacyConfigMigrationSpec[] = [
  defineLegacyConfigMigration({
    id: "audio.transcription-v2",
    describe: "Move audio.transcription to tools.media.audio.models",
    apply: (raw, changes) => {
      const audio = getRecord(raw.audio);
      if (audio?.transcription === undefined) {
        return;
      }

      applyLegacyAudioTranscriptionModel({
        raw,
        source: audio.transcription,
        changes,
        movedMessage: "Moved audio.transcription → tools.media.audio.models.",
        alreadySetMessage: "Removed audio.transcription (tools.media.audio.models already set).",
        invalidMessage: "Removed audio.transcription (invalid or empty command).",
      });
      delete audio.transcription;
      if (Object.keys(audio).length === 0) {
        delete raw.audio;
      } else {
        raw.audio = audio;
      }
    },
  }),
];
