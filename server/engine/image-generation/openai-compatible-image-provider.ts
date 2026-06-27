/**
 * Factory for image providers with OpenAI-compatible generation endpoints.
 *
 * 移植自 openclaw/src/image-generation/openai-compatible-image-provider.ts
 *
 * Supports providers that expose OpenAI-style /v1/images/generations endpoint
 * (OpenAI DALL-E, DashScope wanx, etc.)
 */

import { logger } from "../../logger.js";
import { parseOpenAiCompatibleImageResponse } from "./image-assets.js";
import type {
  ImageGenerationProvider,
  ImageGenerationProviderCapabilities,
  ImageGenerationRequest,
  ImageGenerationResult,
} from "./types.js";

export type OpenAiCompatibleImageProviderOptions = {
  id: string;
  label: string;
  aliases?: string[];
  defaultModel: string;
  models: readonly string[];
  capabilities: ImageGenerationProviderCapabilities;
  defaultBaseUrl: string;
  defaultTimeoutMs?: number;
  apiKeyEnvVar?: string;
  baseUrlEnvVar?: string;
  /**
   * Build the request body for /v1/images/generations.
   */
  buildGenerateBody: (params: {
    req: ImageGenerationRequest;
    model: string;
    count: number;
  }) => Record<string, unknown>;
  /**
   * Optional: validate that the request is supported before sending.
   * Return an error string if not supported, or undefined if OK.
   */
  validateRequest?: (req: ImageGenerationRequest) => string | undefined;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveApiKey(
  req: ImageGenerationRequest,
  apiKeyEnvVar?: string,
): string | undefined {
  if (req.apiKey) return req.apiKey;
  if (apiKeyEnvVar && process.env[apiKeyEnvVar]) {
    return process.env[apiKeyEnvVar];
  }
  // Fallback to common env vars
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  return undefined;
}

function resolveBaseUrl(
  req: ImageGenerationRequest,
  baseUrlEnvVar: string | undefined,
  defaultBaseUrl: string,
): string {
  if (req.baseUrl) return trimTrailingSlash(req.baseUrl);
  if (baseUrlEnvVar && process.env[baseUrlEnvVar]) {
    return trimTrailingSlash(process.env[baseUrlEnvVar]!);
  }
  // Fallback to common env vars
  if (process.env.OPENAI_BASE_URL) {
    return trimTrailingSlash(process.env.OPENAI_BASE_URL);
  }
  return trimTrailingSlash(defaultBaseUrl);
}

/**
 * Create an OpenAI-compatible image generation provider.
 */
export function createOpenAiCompatibleImageProvider(
  options: OpenAiCompatibleImageProviderOptions,
): ImageGenerationProvider {
  const {
    id,
    label,
    aliases,
    defaultModel,
    models,
    capabilities,
    defaultBaseUrl,
    defaultTimeoutMs,
    apiKeyEnvVar,
    baseUrlEnvVar,
    buildGenerateBody,
    validateRequest,
  } = options;

  const provider: ImageGenerationProvider = {
    id,
    aliases,
    label,
    defaultModel,
    models: [...models],
    capabilities,
    defaultTimeoutMs,

    isConfigured(): boolean {
      return !!resolveApiKey({ provider: id, model: defaultModel, prompt: "" }, apiKeyEnvVar);
    },

    async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
      // Validate request
      if (validateRequest) {
        const validationError = validateRequest(req);
        if (validationError) {
          throw new Error(validationError);
        }
      }

      const apiKey = resolveApiKey(req, apiKeyEnvVar);
      if (!apiKey) {
        throw new Error(`API key not configured for provider: ${id}`);
      }

      const baseUrl = resolveBaseUrl(req, baseUrlEnvVar, defaultBaseUrl);
      const endpoint = `${baseUrl}/v1/images/generations`;
      const model = req.model || defaultModel;
      const count = Math.max(1, Math.min(req.count || 1, capabilities.generate.maxCount || 1));
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs ?? 60000;

      // Build request body
      const body = buildGenerateBody({ req, model, count });

      logger.debug(
        `[ImageGeneration] ${id}: POST ${endpoint} model=${model} count=${count}`,
      );

      // Timeout controller
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(
            `${id} API error (HTTP ${response.status}): ${errorText}`,
          );
        }

        const data = await response.json() as Record<string, unknown>;
        const images = parseOpenAiCompatibleImageResponse(
          data as Parameters<typeof parseOpenAiCompatibleImageResponse>[0],
        );

        if (images.length === 0) {
          throw new Error(`${id}: No images returned from API`);
        }

        return {
          images,
          model,
          metadata: {
            provider: id,
            createdAt: Date.now(),
          },
        };
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error(`${id}: Request timed out after ${timeoutMs}ms`);
        }
        throw err;
      }
    },
  };

  return provider;
}
