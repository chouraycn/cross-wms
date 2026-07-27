import { DEFAULT_TIMEOUT_SECONDS } from "./defaults.constants.js";

export function resolveTimeoutMs(config?: { timeoutSeconds?: number }): number {
  const seconds = config?.timeoutSeconds;
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return Math.floor(seconds * 1000);
  }
  return DEFAULT_TIMEOUT_SECONDS * 1000;
}

export function resolveMaxBytes(
  capability: "image" | "audio" | "video",
  config?: { maxBytes?: number },
): number {
  if (typeof config?.maxBytes === "number" && Number.isFinite(config.maxBytes) && config.maxBytes > 0) {
    return config.maxBytes;
  }
  const defaults = {
    image: 20 * 1024 * 1024,
    audio: 25 * 1024 * 1024,
    video: 50 * 1024 * 1024,
  };
  return defaults[capability];
}

export function resolveMaxChars(config?: { maxChars?: number }): number | undefined {
  if (typeof config?.maxChars === "number" && Number.isFinite(config.maxChars) && config.maxChars > 0) {
    return config.maxChars;
  }
  return undefined;
}

export function resolvePrompt(config?: { prompt?: string }): string | undefined {
  const prompt = config?.prompt?.trim();
  return prompt || undefined;
}

export function resolveMediaRuntimeTimeoutMs(timeoutMs: number | undefined): number {
  if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.floor(timeoutMs);
  }
  return DEFAULT_TIMEOUT_SECONDS * 1000;
}

export function resolveConcurrency(cfg?: { tools?: { media?: { concurrency?: number } } }): number {
  const concurrency = cfg?.tools?.media?.concurrency;
  if (typeof concurrency === "number" && Number.isFinite(concurrency) && concurrency > 0) {
    return Math.floor(concurrency);
  }
  return 3;
}
