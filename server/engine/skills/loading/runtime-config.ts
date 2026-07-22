import { getRuntimeConfigSnapshot } from "../../config/runtime-snapshot.js";

interface SkillConfigEntry {
  apiKey?: string;
}

interface SkillsConfig {
  entries?: Record<string, SkillConfigEntry>;
}

interface RuntimeConfig {
  skills?: SkillsConfig;
}

function hasConfiguredSkillApiKeyRef(config?: RuntimeConfig): boolean {
  const entries = config?.skills?.entries;
  if (!entries || typeof entries !== "object") {
    return false;
  }
  for (const skillConfig of Object.values(entries)) {
    if (!skillConfig || typeof skillConfig !== "object") {
      continue;
    }
    if (skillConfig.apiKey !== undefined) {
      return true;
    }
  }
  return false;
}

export function resolveSkillRuntimeConfig(config?: RuntimeConfig): RuntimeConfig | undefined {
  const runtimeConfig = getRuntimeConfigSnapshot() as RuntimeConfig | undefined;
  if (!runtimeConfig) {
    return config;
  }
  if (!config) {
    return runtimeConfig;
  }
  const runtimeHasRawSkillSecretRefs = hasConfiguredSkillApiKeyRef(runtimeConfig);
  const configHasRawSkillSecretRefs = hasConfiguredSkillApiKeyRef(config);
  if (runtimeHasRawSkillSecretRefs && !configHasRawSkillSecretRefs) {
    return config;
  }
  return runtimeConfig;
}