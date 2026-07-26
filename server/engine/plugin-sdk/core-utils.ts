function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : "";
}

export function stripChannelTargetPrefix(raw: string, ...providers: string[]): string {
  const trimmed = raw.trim();
  for (const provider of providers) {
    const prefix = `${normalizeLowercaseStringOrEmpty(provider)}:`;
    if (normalizeLowercaseStringOrEmpty(trimmed).startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return trimmed;
}

export function stripTargetKindPrefix(raw: string): string {
  return raw.replace(/^(user|channel|group|conversation|room|dm):/i, "").trim();
}

export type {
  PluginLogger,
  PluginConfigSchema,
} from "./types.js";
