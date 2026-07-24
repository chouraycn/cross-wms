export interface TtsConfig {
  defaultProvider?: string;
  voice?: string;
  rate?: number;
}

export function resolveEffectiveTtsConfig(config?: unknown): TtsConfig {
  if (!config || typeof config !== 'object') {
    return {};
  }
  const cfg = config as Record<string, unknown>;
  return {
    defaultProvider: cfg.defaultProvider as string | undefined,
    voice: cfg.voice as string | undefined,
    rate: cfg.rate as number | undefined,
  };
}
