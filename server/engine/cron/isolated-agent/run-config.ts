import type { IsolatedAgentRuntimeConfig } from "./types.js";

const DEFAULT_TIMEOUT_SECONDS = 300;
const DEFAULT_NO_OUTPUT_TIMEOUT_SECONDS = 120;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024 * 10;

export function resolveIsolatedAgentRuntimeConfig(
  raw?: Partial<IsolatedAgentRuntimeConfig>,
): IsolatedAgentRuntimeConfig {
  return {
    allowUnsafeExternalContent: raw?.allowUnsafeExternalContent ?? false,
    lightContext: raw?.lightContext ?? false,
    toolsAllow: raw?.toolsAllow ? [...raw.toolsAllow] : undefined,
    timeoutSeconds: raw?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    noOutputTimeoutSeconds: raw?.noOutputTimeoutSeconds ?? DEFAULT_NO_OUTPUT_TIMEOUT_SECONDS,
    maxOutputBytes: raw?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
  };
}

export function validateIsolatedAgentRuntimeConfig(config: IsolatedAgentRuntimeConfig): string[] {
  const errors: string[] = [];
  if (config.timeoutSeconds !== undefined && (config.timeoutSeconds < 1 || config.timeoutSeconds > 86400)) {
    errors.push("timeoutSeconds must be between 1 and 86400");
  }
  if (config.noOutputTimeoutSeconds !== undefined && (config.noOutputTimeoutSeconds < 1 || config.noOutputTimeoutSeconds > 86400)) {
    errors.push("noOutputTimeoutSeconds must be between 1 and 86400");
  }
  if (config.maxOutputBytes !== undefined && (config.maxOutputBytes < 1024 || config.maxOutputBytes > 1024 * 1024 * 100)) {
    errors.push("maxOutputBytes must be between 1024 and 104857600");
  }
  return errors;
}