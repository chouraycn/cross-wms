// Resolution helpers derive media-understanding timeouts, prompts, byte/char
// caps, scope decisions, model entries, and concurrency.
// Ported from openclaw/src/media-understanding/resolve.ts.
// Simplified for cross-wms: removed dependency on normalization-core number
// coercion and MsgContext; provides basic resolution helpers.
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type {
  MediaUnderstandingConfig,
  MediaUnderstandingModelConfig,
} from "../config/types.tools.js";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_CHARS_BY_CAPABILITY,
  DEFAULT_MEDIA_CONCURRENCY,
  DEFAULT_PROMPT,
  DEFAULT_TIMEOUT_SECONDS,
} from "./defaults.constants.js";
import { resolveEffectiveMediaEntryCapabilities } from "./entry-capabilities.js";
import type { MediaUnderstandingCapability, MediaUnderstandingCapabilityRegistry } from "./types.js";

/** Default per-provider media-understanding runtime timeout in milliseconds. */
export const DEFAULT_MEDIA_RUNTIME_TIMEOUT_MS = 30_000;
const MIN_MEDIA_TIMEOUT_MS = 1000;
const MAX_TIMER_TIMEOUT_MS = 2 ** 31 - 1;

function resolveTimerTimeoutMs(timeoutMs: number | undefined, fallbackMs: number): number {
  const value = typeof timeoutMs === "number" && Number.isFinite(timeoutMs) ? timeoutMs : fallbackMs;
  if (!Number.isFinite(value) || value <= 0) {
    return fallbackMs;
  }
  return Math.min(Math.max(Math.floor(value), MIN_MEDIA_TIMEOUT_MS), MAX_TIMER_TIMEOUT_MS);
}

/** Converts configured timeout seconds into a timer-safe millisecond deadline. */
export function resolveTimeoutMs(seconds: number | undefined, fallbackSeconds: number): number {
  const value = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : fallbackSeconds;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return MIN_MEDIA_TIMEOUT_MS;
  }
  const timeoutMs = Math.floor(value * 1000);
  return resolveTimerTimeoutMs(
    Number.isFinite(timeoutMs) ? timeoutMs : MAX_TIMER_TIMEOUT_MS,
    MIN_MEDIA_TIMEOUT_MS,
  );
}

/** Clamps an already-millisecond runtime timeout to the shared timer bounds. */
export function resolveMediaRuntimeTimeoutMs(timeoutMs: number | undefined): number {
  return resolveTimerTimeoutMs(timeoutMs, DEFAULT_MEDIA_RUNTIME_TIMEOUT_MS);
}

/** Resolves the provider prompt and appends length guidance for non-audio outputs. */
export function resolvePrompt(
  capability: MediaUnderstandingCapability,
  prompt?: string,
  maxChars?: number,
): string {
  const base = prompt?.trim() || DEFAULT_PROMPT[capability];
  if (!maxChars || capability === "audio") {
    return base;
  }
  return `${base} Respond in at most ${maxChars} characters.`;
}

/** Resolves the effective max response characters for a model entry and capability. */
export function resolveMaxChars(params: {
  capability: MediaUnderstandingCapability;
  entry: MediaUnderstandingModelConfig;
  cfg: OpenClawConfig;
  config?: MediaUnderstandingConfig;
}): number | undefined {
  const { capability, entry, cfg } = params;
  const configured =
    entry.maxChars ?? params.config?.maxChars ?? cfg.tools?.media?.[capability]?.maxChars;
  if (typeof configured === "number") {
    return configured;
  }
  return DEFAULT_MAX_CHARS_BY_CAPABILITY[capability];
}

/** Resolves the effective input byte cap for a model entry and capability. */
export function resolveMaxBytes(params: {
  capability: MediaUnderstandingCapability;
  entry: MediaUnderstandingModelConfig;
  cfg: OpenClawConfig;
  config?: MediaUnderstandingConfig;
}): number {
  const configured =
    params.entry.maxBytes ??
    params.config?.maxBytes ??
    params.cfg.tools?.media?.[params.capability]?.maxBytes;
  if (typeof configured === "number") {
    return configured;
  }
  return DEFAULT_MAX_BYTES[params.capability];
}

/** Resolves configured model entries that can handle the requested media capability. */
export function resolveModelEntries(params: {
  cfg: OpenClawConfig;
  capability: MediaUnderstandingCapability;
  config?: MediaUnderstandingConfig;
  providerRegistry: MediaUnderstandingCapabilityRegistry;
}): MediaUnderstandingModelConfig[] {
  const { cfg, capability, config } = params;
  const sharedModels = cfg.tools?.media?.models ?? [];
  const entries = [
    ...(config?.models ?? []).map((entry) => ({ entry, source: "capability" as const })),
    ...sharedModels.map((entry) => ({ entry, source: "shared" as const })),
  ];
  if (entries.length === 0) {
    return [];
  }

  return entries
    .filter(({ entry, source }) => {
      const caps = resolveEffectiveMediaEntryCapabilities({
        entry,
        source,
        providerRegistry: params.providerRegistry,
      });
      if (!caps || caps.length === 0) {
        if (source === "shared") {
          return false;
        }
        return true;
      }
      return caps.includes(capability);
    })
    .map(({ entry }) => entry);
}

/** Resolves the bounded media-understanding task concurrency from config. */
export function resolveConcurrency(cfg: OpenClawConfig): number {
  const configured = cfg.tools?.media?.concurrency;
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  return DEFAULT_MEDIA_CONCURRENCY;
}
