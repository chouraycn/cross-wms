/**
 * Runtime entrypoint for image generation with provider fallback and override normalization.
 *
 * 移植自 openclaw/src/image-generation/runtime.ts
 */

import { logger } from "../../logger.js";
import { parseImageGenerationModelRef } from "./model-ref.js";
import { resolveImageGenerationOverrides } from "./normalization.js";
import {
  getImageGenerationProvider,
  listConfiguredImageGenerationProviders,
  listImageGenerationProviders,
} from "./provider-registry.js";
import type {
  GeneratedImageAsset,
  ImageGenerationBackground,
  ImageGenerationIgnoredOverride,
  ImageGenerationNormalization,
  ImageGenerationOutputFormat,
  ImageGenerationProvider,
  ImageGenerationProviderOptions,
  ImageGenerationQuality,
  ImageGenerationResolution,
  ImageGenerationResult,
  ImageGenerationSourceImage,
} from "./types.js";

export type GenerateImageParams = {
  prompt: string;
  modelOverride?: string;
  count?: number;
  size?: string;
  aspectRatio?: string;
  resolution?: ImageGenerationResolution;
  quality?: ImageGenerationQuality;
  outputFormat?: ImageGenerationOutputFormat;
  background?: ImageGenerationBackground;
  inputImages?: ImageGenerationSourceImage[];
  autoProviderFallback?: boolean;
  timeoutMs?: number;
  providerOptions?: ImageGenerationProviderOptions;
  defaultModel?: string;
  fallbackModels?: string[];
};

export type GenerateImageRuntimeResult = {
  images: GeneratedImageAsset[];
  provider: string;
  model: string;
  attempts: Array<{
    provider: string;
    model: string;
    error?: string;
  }>;
  normalization?: ImageGenerationNormalization;
  metadata?: Record<string, unknown>;
  ignoredOverrides: ImageGenerationIgnoredOverride[];
};

export type ListRuntimeImageGenerationProvidersParams = {
  includeUnavailable?: boolean;
};

function resolveModelCandidates(params: {
  modelOverride?: string;
  defaultModel?: string;
  fallbackModels?: string[];
  autoProviderFallback?: boolean;
}): Array<{ provider: string; model: string }> {
  const candidates: Array<{ provider: string; model: string }> = [];
  const seen = new Set<string>();

  function addCandidate(provider: string, model: string) {
    const key = `${provider}/${model}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push({ provider, model });
    }
  }

  // 1. Explicit model override
  if (params.modelOverride) {
    const parsed = parseImageGenerationModelRef(params.modelOverride);
    if (parsed) {
      if (parsed.provider) {
        addCandidate(parsed.provider, parsed.model);
      } else {
        // Model only - try all configured providers with this model
        const configured = listConfiguredImageGenerationProviders();
        for (const p of configured) {
          if (p.models?.includes(parsed.model)) {
            addCandidate(p.id, parsed.model);
          }
        }
      }
    }
  }

  // 2. Default model from config
  if (params.defaultModel) {
    const parsed = parseImageGenerationModelRef(params.defaultModel);
    if (parsed) {
      if (parsed.provider) {
        addCandidate(parsed.provider, parsed.model);
      } else {
        const configured = listConfiguredImageGenerationProviders();
        for (const p of configured) {
          if (p.models?.includes(parsed.model)) {
            addCandidate(p.id, parsed.model);
          }
        }
      }
    }
  }

  // 3. Fallback models
  if (params.fallbackModels && params.fallbackModels.length > 0) {
    for (const fallback of params.fallbackModels) {
      const parsed = parseImageGenerationModelRef(fallback);
      if (parsed) {
        if (parsed.provider) {
          addCandidate(parsed.provider, parsed.model);
        } else {
          const configured = listConfiguredImageGenerationProviders();
          for (const p of configured) {
            if (p.models?.includes(parsed.model)) {
              addCandidate(p.id, parsed.model);
            }
          }
        }
      }
    }
  }

  // 4. Auto fallback - add all configured providers' default models
  if (params.autoProviderFallback !== false) {
    const configured = listConfiguredImageGenerationProviders();
    for (const p of configured) {
      if (p.defaultModel) {
        addCandidate(p.id, p.defaultModel);
      }
    }
  }

  return candidates;
}

function buildNoProviderAvailableMessage(): string {
  const allProviders = listImageGenerationProviders();
  const configured = listConfiguredImageGenerationProviders();

  let msg = "No image-generation providers are configured.\n";
  msg += `Registered providers (${allProviders.length}):\n`;

  for (const p of allProviders) {
    const isConfigured = configured.some((c) => c.id === p.id);
    const status = isConfigured ? "✓ configured" : "✗ not configured";
    msg += `  - ${p.label || p.id}: ${status}\n`;
    if (p.models && p.models.length > 0) {
      msg += `    models: ${p.models.join(", ")}\n`;
    }
  }

  return msg;
}

/**
 * List runtime image-generation providers.
 */
export function listRuntimeImageGenerationProviders(
  params: ListRuntimeImageGenerationProvidersParams = {},
): ImageGenerationProvider[] {
  if (params.includeUnavailable) {
    return listImageGenerationProviders();
  }
  return listConfiguredImageGenerationProviders();
}

/**
 * Generate an image using the configured providers with fallback support.
 */
export async function generateImage(
  params: GenerateImageParams,
): Promise<GenerateImageRuntimeResult> {
  const candidates = resolveModelCandidates({
    modelOverride: params.modelOverride,
    defaultModel: params.defaultModel,
    fallbackModels: params.fallbackModels,
    autoProviderFallback: params.autoProviderFallback,
  });

  if (candidates.length === 0) {
    throw new Error(buildNoProviderAvailableMessage());
  }

  const attempts: Array<{
    provider: string;
    model: string;
    error?: string;
  }> = [];
  let lastError: unknown;

  // Try each candidate in order
  for (const candidate of candidates) {
    const provider = getImageGenerationProvider(candidate.provider);
    if (!provider) {
      const error = `Provider not registered: ${candidate.provider}`;
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        error,
      });
      lastError = new Error(error);
      logger.warn(
        `[ImageGeneration] candidate failed: ${candidate.provider}/${candidate.model}: ${error}`,
      );
      continue;
    }

    // Check if provider is configured
    if (provider.isConfigured && !provider.isConfigured()) {
      const error = "Provider not configured (missing API key)";
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        error,
      });
      lastError = new Error(error);
      logger.warn(
        `[ImageGeneration] candidate failed: ${candidate.provider}/${candidate.model}: ${error}`,
      );
      continue;
    }

    try {
      // Resolve timeout
      const timeoutMs = params.timeoutMs ?? provider.defaultTimeoutMs ?? 60000;

      // Normalize overrides based on provider capabilities
      const sanitized = resolveImageGenerationOverrides({
        provider,
        model: candidate.model,
        size: params.size,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        quality: params.quality,
        outputFormat: params.outputFormat,
        background: params.background,
        inputImages: params.inputImages,
      });

      // Call provider
      const result: ImageGenerationResult = await provider.generateImage({
        provider: candidate.provider,
        model: candidate.model,
        prompt: params.prompt,
        count: params.count,
        size: sanitized.size,
        aspectRatio: sanitized.aspectRatio,
        resolution: sanitized.resolution,
        quality: sanitized.quality,
        outputFormat: sanitized.outputFormat,
        background: sanitized.background,
        inputImages: params.inputImages,
        timeoutMs,
        providerOptions: params.providerOptions,
      });

      if (!Array.isArray(result.images) || result.images.length === 0) {
        throw new Error("Provider returned no images.");
      }

      return {
        images: result.images,
        provider: candidate.provider,
        model: result.model ?? candidate.model,
        attempts,
        normalization: sanitized.normalization,
        metadata: result.metadata,
        ignoredOverrides: sanitized.ignoredOverrides,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        error: errorMsg,
      });
      lastError = err;
      logger.warn(
        `[ImageGeneration] candidate failed: ${candidate.provider}/${candidate.model}: ${errorMsg}`,
      );
      continue;
    }
  }

  // All candidates failed
  const allErrors = attempts
    .map((a) => `  - ${a.provider}/${a.model}: ${a.error || "unknown error"}`)
    .join("\n");

  throw new Error(
    `All image-generation candidates failed:\n${allErrors}\n\nLast error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
