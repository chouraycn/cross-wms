export interface TtsConfig {
  defaultProvider?: string;
  voice?: string;
  rate?: number;
}

export function resolveEffectiveTtsConfig(config?: unknown): TtsConfig {
  if (!config || typeof config !== 'object') {
    return {};
  }
  return {
    defaultProvider: (config as any).defaultProvider,
    voice: (config as any).voice,
    rate: (config as any).rate,
  };
}
