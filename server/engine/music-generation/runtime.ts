// Runs music generation requests through provider runtimes and fallbacks.
import type { FallbackAttempt } from "../agents/model-fallback.types.js";
import { resolveAgentModelTimeoutMsValue } from "../config/model-input.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  buildMediaGenerationNormalizationMetadata,
  buildNoCapabilityModelConfiguredMessage,
  recordCapabilityCandidateFailure,
  throwCapabilityGenerationFailure,
} from "../media-generation/runtime-shared.js";
import { getProviderEnvVars } from "../secrets/provider-env-vars.js";
import { parseMusicGenerationModelRef } from "./model-ref.js";
import { resolveMusicGenerationOverrides } from "./normalization.js";
import { getMusicGenerationProvider, listMusicGenerationProviders } from "./provider-registry.js";
import type { GenerateMusicParams, GenerateMusicRuntimeResult } from "./runtime-types.js";
import type { MusicResult } from "./types.js";

type ParsedProviderModelRef = { provider: string; model: string };

function resolveCapabilityModelCandidates(params: {
  cfg: unknown;
  modelConfig: any;
  modelOverride?: string;
  parseModelRef: (raw: string | undefined) => ParsedProviderModelRef | null;
  agentDir?: string;
  listProviders?: (cfg?: unknown) => unknown[];
  autoProviderFallback?: boolean;
}): ParsedProviderModelRef[] {
  const candidates: ParsedProviderModelRef[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined) => {
    const ref = params.parseModelRef(raw);
    if (!ref) return;
    const key = `${ref.provider}/${ref.model}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(ref);
  };
  if (params.modelOverride) {
    const override = params.parseModelRef(params.modelOverride);
    if (override) return [override];
  }
  if (params.modelConfig?.model) {
    add(params.modelConfig.model);
  }
  if (params.modelConfig?.fallbacks) {
    for (const fallback of params.modelConfig.fallbacks) {
      add(fallback);
    }
  }
  return candidates;
}

/**
 * Music generation runtime orchestration.
 *
 * The runtime resolves provider/model candidates, applies capability-based
 * normalization, invokes providers, and records fallback attempts consistently
 * with other media generation capabilities.
 */
const log = createSubsystemLogger("music-generation");

/** Injectable dependencies used by tests and alternate runtime hosts. */
export type MusicGenerationRuntimeDeps = {
  getProvider?: typeof getMusicGenerationProvider;
  listProviders?: typeof listMusicGenerationProviders;
  getProviderEnvVars?: typeof getProviderEnvVars;
  log?: Pick<typeof log, "debug">;
};

export type { GenerateMusicParams, GenerateMusicRuntimeResult } from "./runtime-types.js";

/** List runtime-visible music generation providers for a config snapshot. */
export function listRuntimeMusicGenerationProviders(
  params?: { config?: OpenClawConfig },
  deps: MusicGenerationRuntimeDeps = {},
) {
  return (deps.listProviders ?? listMusicGenerationProviders)(params?.config);
}

/** Generate music with provider fallback and capability-aware request normalization. */
export async function generateMusic(
  params: GenerateMusicParams,
  deps: MusicGenerationRuntimeDeps = {},
): Promise<GenerateMusicRuntimeResult> {
  const getProvider = deps.getProvider ?? getMusicGenerationProvider;
  const listProviders = deps.listProviders ?? listMusicGenerationProviders;
  const logger = deps.log ?? log;
  const timeoutMs =
    params.timeoutMs ??
    resolveAgentModelTimeoutMsValue(params.cfg.agents?.defaults?.musicGenerationModel);
  const candidates = resolveCapabilityModelCandidates({
    cfg: params.cfg,
    modelConfig: params.cfg.agents?.defaults?.musicGenerationModel,
    modelOverride: params.modelOverride,
    parseModelRef: parseMusicGenerationModelRef,
    agentDir: params.agentDir,
    listProviders,
    autoProviderFallback: params.autoProviderFallback,
  });
  if (candidates.length === 0) {
    throw new Error(
      buildNoCapabilityModelConfiguredMessage({
        capabilityLabel: "music-generation",
        modelConfigKey: "musicGenerationModel",
        providers: listProviders(params.cfg),
        fallbackSampleRef: "google/lyria-3-clip-preview",
        getProviderEnvVars: deps.getProviderEnvVars,
      }),
    );
  }

  const attempts: FallbackAttempt[] = [];
  let lastError: unknown;

  for (const candidate of candidates) {
    const provider = getProvider(candidate.provider, params.cfg);
    if (!provider) {
      // Candidate resolution can include stale config refs; keep them in attempts for diagnostics.
      const error = `No music-generation provider registered for ${candidate.provider}`;
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        error,
      });
      lastError = new Error(error);
      continue;
    }

    try {
      const sanitized = resolveMusicGenerationOverrides({
        provider,
        model: candidate.model,
        lyrics: params.lyrics,
        instrumental: params.instrumental,
        durationSeconds: params.durationSeconds,
        format: params.format,
        inputImages: params.inputImages,
      });
      const result: MusicResult = await provider.generateMusic({
        provider: candidate.provider,
        model: candidate.model,
        prompt: params.prompt,
        cfg: params.cfg,
        agentDir: params.agentDir,
        authStore: params.authStore,
        lyrics: sanitized.lyrics,
        instrumental: sanitized.instrumental,
        durationSeconds: sanitized.durationSeconds,
        format: sanitized.format,
        inputImages: params.inputImages,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      } as any);
      if (!Array.isArray(result.tracks) || result.tracks.length === 0) {
        throw new Error("Music generation provider returned no tracks.");
      }
      return {
        tracks: result.tracks,
        provider: candidate.provider,
        model: result.model ?? candidate.model,
        attempts,
        lyrics: result.lyrics,
        normalization: sanitized.normalization,
        metadata: {
          ...result.metadata,
          ...buildMediaGenerationNormalizationMetadata({
            normalization: sanitized.normalization as any,
          }),
        },
        ignoredOverrides: sanitized.ignoredOverrides,
      };
    } catch (err) {
      lastError = err;
      // Preserve failed candidates so callers can see which provider/model refs were tried.
      recordCapabilityCandidateFailure({
        attempts,
        provider: candidate.provider,
        model: candidate.model,
        error: err,
      });
      logger.debug(`music-generation candidate failed: ${candidate.provider}/${candidate.model}`);
    }
  }

  return throwCapabilityGenerationFailure({
    capabilityLabel: "music generation",
    attempts,
    lastError,
  });
}
