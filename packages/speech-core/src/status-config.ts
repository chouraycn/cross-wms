// TTS 状态配置：解析与校验 TTS 状态输出配置。
// 参考 openclaw/src/tts/status-config.ts 的设计意图。

const DEFAULT_TTS_MAX_LENGTH = 1500;
const DEFAULT_TTS_SUMMARIZE = true;
const MAX_STATUS_DETAIL_LENGTH = 96;

/** TTS 状态配置，描述当前 TTS 运行态的关键信息。 */
export interface TtsStatusConfig {
  /** 自动模式：off / always / inbound / tagged。 */
  autoMode: string;
  /** provider 标识。 */
  provider: string;
  /** 展示名称。 */
  displayName?: string;
  /** 模型标识。 */
  model?: string;
  /** 音色标识。 */
  voice?: string;
  /** persona 标识。 */
  persona?: string;
  /** 最大文本长度。 */
  maxLength: number;
  /** 是否启用摘要。 */
  summarize: boolean;
}

/** resolveTtsStatusConfig 的输入，允许部分字段缺失。 */
export type TtsStatusConfigInput = Partial<TtsStatusConfig> & {
  /** 兼容旧字段：true 视为 always，false 视为 off。 */
  enabled?: boolean;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : undefined;
}

function normalizeStatusDetail(
  value: unknown,
  maxLength = MAX_STATUS_DETAIL_LENGTH,
): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  const collapsed = normalized.replace(/\s+/g, " ");
  return collapsed.length > maxLength
    ? `${collapsed.slice(0, maxLength - 3)}...`
    : collapsed;
}

function resolveAutoMode(input: TtsStatusConfigInput): string {
  const explicit = normalizeOptionalLowercaseString(input.autoMode);
  if (explicit) {
    return explicit;
  }
  return typeof input.enabled === "boolean" ? (input.enabled ? "always" : "off") : "off";
}

/** 从输入解析出完整的 TtsStatusConfig，缺失字段使用默认值。 */
export function resolveTtsStatusConfig(input: TtsStatusConfigInput): TtsStatusConfig {
  const autoMode = resolveAutoMode(input);
  const provider = normalizeOptionalLowercaseString(input.provider) ?? "auto";
  const displayName = normalizeStatusDetail(input.displayName);
  const model = normalizeStatusDetail(input.model);
  const voice = normalizeStatusDetail(input.voice);
  const persona = normalizeOptionalLowercaseString(input.persona);

  const config: TtsStatusConfig = {
    autoMode,
    provider,
    maxLength:
      typeof input.maxLength === "number" &&
      Number.isFinite(input.maxLength) &&
      input.maxLength > 0
        ? Math.floor(input.maxLength)
        : DEFAULT_TTS_MAX_LENGTH,
    summarize: typeof input.summarize === "boolean" ? input.summarize : DEFAULT_TTS_SUMMARIZE,
  };
  if (displayName) {
    config.displayName = displayName;
  }
  if (model) {
    config.model = model;
  }
  if (voice) {
    config.voice = voice;
  }
  if (persona) {
    config.persona = persona;
  }
  return config;
}

/** 校验 TtsStatusConfig 字段一致性，返回错误信息列表，空数组表示通过。 */
export function validateTtsStatusConfig(config: unknown): string[] {
  const errors: string[] = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return ["status config 必须是对象"];
  }
  const cfg = config as Partial<TtsStatusConfig>;
  if (typeof cfg.autoMode !== "string" || cfg.autoMode.trim().length === 0) {
    errors.push("autoMode 必须是非空字符串");
  }
  if (typeof cfg.provider !== "string" || cfg.provider.trim().length === 0) {
    errors.push("provider 必须是非空字符串");
  }
  if (
    typeof cfg.maxLength !== "number" ||
    !Number.isFinite(cfg.maxLength) ||
    cfg.maxLength <= 0
  ) {
    errors.push("maxLength 必须是正数");
  }
  if (typeof cfg.summarize !== "boolean") {
    errors.push("summarize 必须是布尔值");
  }
  return errors;
}
