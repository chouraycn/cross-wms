// Media-understanding default model/provider selection from config, manifest
// metadata, and capability declarations.
// Ported from openclaw/src/media-understanding/defaults.ts.
// Simplified for cross-wms: removed manifest metadata registry and caching,
// provides basic config-based provider/model resolution helpers.
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizeMediaProviderId } from "./provider-id.js";
import type { MediaUnderstandingCapability, MediaUnderstandingProvider } from "./types.js";
export {
  CLI_OUTPUT_MAX_BUFFER,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_CHARS,
  DEFAULT_MAX_CHARS_BY_CAPABILITY,
  DEFAULT_MEDIA_CONCURRENCY,
  DEFAULT_PROMPT,
  DEFAULT_TIMEOUT_SECONDS,
  DEFAULT_VIDEO_MAX_BASE64_BYTES,
  MIN_AUDIO_FILE_BYTES,
} from "./defaults.constants.js";

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

type MediaUnderstandingProviderWithModels = MediaUnderstandingProvider & {
  defaultModels?: Partial<Record<MediaUnderstandingCapability, string>>;
  autoPriority?: Partial<Record<MediaUnderstandingCapability, number>>;
  nativeDocumentInputs?: string[];
  documentModels?: Record<string, Record<string, string | false>>;
};

function resolveConfiguredImageProviderModel(params: {
  cfg?: OpenClawConfig;
  providerId: string;
}): string | undefined {
  const normalizedProviderId = normalizeMediaProviderId(params.providerId);
  const providers = params.cfg?.models?.providers;
  if (!providers || typeof providers !== "object") {
    return undefined;
  }
  for (const [providerKey, providerCfg] of Object.entries(providers)) {
    if (normalizeMediaProviderId(providerKey) !== normalizedProviderId) {
      continue;
    }
    const models = providerCfg?.models ?? [];
    const match = models.find(
      (model) =>
        Boolean(normalizeOptionalString(model?.id)) &&
        Array.isArray(model?.input) &&
        model.input.includes("image"),
    );
    return normalizeOptionalString(match?.id);
  }
  return undefined;
}

/** Resolves the default provider model for a media capability from config or registry. */
export function resolveDefaultMediaModel(params: {
  providerId: string;
  capability: MediaUnderstandingCapability;
  cfg?: OpenClawConfig;
  workspaceDir?: string;
  providerRegistry?: Map<string, MediaUnderstandingProvider>;
  includeConfiguredImageModels?: boolean;
}): string | undefined {
  if (!params.providerRegistry && params.includeConfiguredImageModels !== false) {
    const configuredImageModel =
      params.capability === "image"
        ? resolveConfiguredImageProviderModel({
            cfg: params.cfg,
            providerId: params.providerId,
          })
        : undefined;
    if (configuredImageModel) {
      return configuredImageModel;
    }
  }
  const registry = params.providerRegistry;
  if (!registry) {
    return undefined;
  }
  const provider = registry.get(normalizeMediaProviderId(params.providerId)) as
    | MediaUnderstandingProviderWithModels
    | undefined;
  const manifestDefaultModel = normalizeOptionalString(
    provider?.defaultModels?.[params.capability],
  );
  if (manifestDefaultModel) {
    return manifestDefaultModel;
  }
  return undefined;
}

/** Resolves auto-discovery provider order for a media capability using priorities. */
export function resolveAutoMediaKeyProviders(params: {
  capability: MediaUnderstandingCapability;
  cfg?: OpenClawConfig;
  workspaceDir?: string;
  providerRegistry?: Map<string, MediaUnderstandingProvider>;
}): string[] {
  const registry = params.providerRegistry;
  if (!registry) {
    return [];
  }
  type AutoProviderEntry = {
    provider: MediaUnderstandingProviderWithModels;
    priority: number;
  };
  const prioritized = [...registry.values()]
    .filter((provider) => provider?.capabilities?.includes(params.capability))
    .map((provider): AutoProviderEntry | null => {
      const providerWithModels = provider as MediaUnderstandingProviderWithModels;
      const priority = providerWithModels.autoPriority?.[params.capability];
      return typeof priority === "number" && Number.isFinite(priority)
        ? { provider: providerWithModels, priority }
        : null;
    })
    .filter((entry): entry is AutoProviderEntry => entry !== null)
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.provider.id.localeCompare(right.provider.id);
    })
    .map((entry) => normalizeMediaProviderId(entry.provider.id))
    .filter(Boolean);
  return prioritized;
}

/** Returns whether provider metadata declares native PDF document input support. */
export function providerSupportsNativePdfDocument(params: {
  providerId: string;
  cfg?: OpenClawConfig;
  workspaceDir?: string;
  providerRegistry?: Map<string, MediaUnderstandingProvider>;
}): boolean {
  const registry = params.providerRegistry;
  if (!registry) {
    return false;
  }
  const provider = registry.get(normalizeMediaProviderId(params.providerId)) as
    | MediaUnderstandingProviderWithModels
    | undefined;
  return provider?.nativeDocumentInputs?.includes("pdf") ?? false;
}

/** Resolves provider-specific document model hints, preserving explicit unsupported markers. */
export function resolveDocumentMediaModel(params: {
  providerId: string;
  document: "pdf";
  mode: "textExtraction" | "image";
  cfg?: OpenClawConfig;
  workspaceDir?: string;
  providerRegistry?: Map<string, MediaUnderstandingProvider>;
}): string | false | undefined {
  const registry = params.providerRegistry;
  if (!registry) {
    return undefined;
  }
  const provider = registry.get(normalizeMediaProviderId(params.providerId)) as
    | MediaUnderstandingProviderWithModels
    | undefined;
  const value = provider?.documentModels?.[params.document]?.[params.mode];
  if (value === false) {
    return false;
  }
  return normalizeOptionalString(value);
}
