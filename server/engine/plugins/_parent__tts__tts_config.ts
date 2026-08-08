export interface TtsConfig {
  defaultProvider?: string;
  voice?: string;
  rate?: number;
}

export function resolveEffectiveTtsConfig(config?: any): TtsConfig {
  if (!config || typeof config !== 'object') {
    return {};
  }
  const cfg = config as Record<string, any>;
  return {
    defaultProvider: cfg.defaultProvider as string | undefined,
    voice: cfg.voice as string | undefined,
    rate: cfg.rate as number | undefined,
  };
}
