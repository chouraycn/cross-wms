// 存储语音唤醒触发器配置。
// 移植自 openclaw/src/infra/voicewake.ts（降级实现）。
//
// 降级说明：
//  - @openclaw/normalization-core/string-coerce 替换为 ./string-coerce.js
//  - ../state/openclaw-state-db.js 未移植，降级为文件 JSON 持久化
//  - ./kysely-sync.js 保留类型引用但运行时降级
//  - 状态持久化到 ${stateDir}/voicewake-triggers.json
import path from "node:path";
import { normalizeOptionalString } from "./string-coerce.js";
import { resolveStateDir, tryReadJsonFileSync, writeJsonFileSync } from "./_runtime-stubs.js";

// 语音唤醒配置存储本地语音集成使用的触发词。
type VoiceWakeConfig = {
  triggers: string[];
  updatedAtMs: number;
};

const DEFAULT_TRIGGERS = ["openclaw", "claude", "computer"];
const VOICEWAKE_CONFIG_KEY = "default";
const VOICEWAKE_STATE_FILENAME = "voicewake-triggers.json";

type VoiceWakeTriggerRow = {
  config_key: string;
  position: number;
  trigger: string;
  updated_at_ms: number;
};

function sanitizeTriggers(triggers: string[] | undefined | null): string[] {
  const cleaned = (triggers ?? [])
    .map((w) => normalizeOptionalString(w) ?? "")
    .filter((w) => w.length > 0);
  return cleaned.length > 0 ? cleaned : DEFAULT_TRIGGERS;
}

function resolveVoicewakeStatePath(stateDir?: string): string {
  const root = stateDir ?? resolveStateDir();
  return path.join(root, VOICEWAKE_STATE_FILENAME);
}

function loadTriggersFromState(stateDir?: string): VoiceWakeTriggerRow[] {
  const filePath = resolveVoicewakeStatePath(stateDir);
  const state = tryReadJsonFileSync<{ triggers?: VoiceWakeTriggerRow[] }>(filePath);
  return state?.triggers ?? [];
}

function saveTriggersToState(rows: VoiceWakeTriggerRow[], stateDir?: string): void {
  const filePath = resolveVoicewakeStatePath(stateDir);
  writeJsonFileSync(filePath, { triggers: rows, configKey: VOICEWAKE_CONFIG_KEY }, { trailingNewline: true });
}

/** 返回内置的语音唤醒触发词列表。 */
export function defaultVoiceWakeTriggers() {
  return [...DEFAULT_TRIGGERS];
}

/** 加载持久化的语音唤醒触发词，失败时回退到默认值。 */
export async function loadVoiceWakeConfig(baseDir?: string): Promise<VoiceWakeConfig> {
  const rows = loadTriggersFromState(baseDir);
  if (rows.length === 0) {
    return { triggers: defaultVoiceWakeTriggers(), updatedAtMs: 0 };
  }
  return {
    triggers: sanitizeTriggers(rows.map((row) => row.trigger)),
    updatedAtMs: Math.max(0, ...rows.map((row) => row.updated_at_ms)),
  };
}

/** 持久化配置的语音唤醒触发词列表。 */
export async function setVoiceWakeTriggers(
  triggers: string[],
  baseDir?: string,
): Promise<VoiceWakeConfig> {
  const sanitized = sanitizeTriggers(triggers);
  const updatedAtMs = Date.now();
  const rows: VoiceWakeTriggerRow[] = sanitized.map((trigger, position) => ({
    config_key: VOICEWAKE_CONFIG_KEY,
    position,
    trigger,
    updated_at_ms: updatedAtMs,
  }));
  saveTriggersToState(rows, baseDir);
  return {
    triggers: sanitized,
    updatedAtMs,
  };
}
