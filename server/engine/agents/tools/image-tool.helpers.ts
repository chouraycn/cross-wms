/**
 * Image/media understanding helper functions.
 *
 * Handles model config, data URL decoding, provider lookup, and reasoning-only response validation.
 */

export type ImageModelConfig = {
  primary?: string;
  fallbacks?: string[];
  timeoutMs?: number;
};

const IMAGE_REASONING_FALLBACK_SIGNATURES = new Set([
  "reasoning_content",
  "reasoning",
  "reasoning_details",
  "reasoning_text",
]);
const MAX_IMAGE_REASONING_FALLBACK_BLOCKS = 50;
const MAX_IMAGE_REASONING_SIGNATURE_PARSE_CHARS = 2_048;
const MAX_IMAGE_REASONING_SIGNATURE_SCAN_CHARS = 65_536;

type AssistantMessage = {
  content?: unknown;
  stopReason?: string;
  errorMessage?: string;
};

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

function estimateBase64DecodedBytes(b64: string): number {
  const trimmed = b64.replace(/\s/g, "");
  const padding = trimmed.endsWith("==") ? 2 : trimmed.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding);
}

function hasResponsesReasoningSignatureMarkers(value: string): boolean {
  const scanned = value.slice(0, MAX_IMAGE_REASONING_SIGNATURE_SCAN_CHARS);
  return /"id"\s*:\s*"rs_/.test(scanned) && /"type"\s*:\s*"reasoning(?:[."])/.test(scanned);
}

function isImageReasoningFallbackSignature(value: unknown): boolean {
  if (!value) {
    return false;
  }
  if (typeof value === "string") {
    if (IMAGE_REASONING_FALLBACK_SIGNATURES.has(value)) {
      return true;
    }
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
      return false;
    }
    if (trimmed.length > MAX_IMAGE_REASONING_SIGNATURE_PARSE_CHARS) {
      return hasResponsesReasoningSignatureMarkers(trimmed);
    }
    try {
      return isImageReasoningFallbackSignature(JSON.parse(trimmed));
    } catch {
      return false;
    }
  }
  if (typeof value !== "object") {
    return false;
  }
  const record = value as { id?: unknown; type?: unknown };
  const id = typeof record.id === "string" ? record.id : "";
  const type = typeof record.type === "string" ? record.type : "";
  return id.startsWith("rs_") && (type === "reasoning" || type.startsWith("reasoning."));
}

export function hasImageReasoningOnlyResponse(message: AssistantMessage): boolean {
  if (extractAssistantText(message).trim() || !Array.isArray(message.content)) {
    return false;
  }
  let checkedBlocks = 0;
  for (const block of message.content) {
    checkedBlocks += 1;
    if (checkedBlocks > MAX_IMAGE_REASONING_FALLBACK_BLOCKS) {
      break;
    }
    if (!block || typeof block !== "object") {
      continue;
    }
    const record = block as { type?: unknown; thinking?: unknown; thinkingSignature?: unknown };
    if (
      record.type === "thinking" &&
      typeof record.thinking === "string" &&
      isImageReasoningFallbackSignature(record.thinkingSignature)
    ) {
      return true;
    }
  }
  return false;
}

export function decodeDataUrl(
  dataUrl: string,
  opts?: { maxBytes?: number },
): {
  buffer: Buffer;
  mimeType: string;
  kind: "image";
} {
  const trimmed = dataUrl.trim();
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(trimmed);
  if (!match) {
    throw new Error("Invalid data URL (expected base64 data: URL).");
  }
  const mimeType = normalizeLowercaseStringOrEmpty(match[1]);
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Unsupported data URL type: ${mimeType || "unknown"}`);
  }
  const b64 = (match[2] ?? "").trim();
  if (typeof opts?.maxBytes === "number" && estimateBase64DecodedBytes(b64) > opts.maxBytes) {
    throw new Error("Invalid data URL: payload exceeds size limit.");
  }
  const buffer = Buffer.from(b64, "base64");
  if (buffer.length === 0) {
    throw new Error("Invalid data URL: empty payload.");
  }
  return { buffer, mimeType, kind: "image" };
}

function extractAssistantText(message: AssistantMessage): string {
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (block && typeof block === "object" && "text" in block) {
        const text = (block as { text?: unknown }).text;
        if (typeof text === "string") {
          parts.push(text);
        }
      }
    }
    return parts.join("");
  }
  return "";
}

export function coerceImageAssistantText(params: {
  message: AssistantMessage;
  provider: string;
  model: string;
}): string {
  const stop = params.message.stopReason;
  const errorMessage = params.message.errorMessage?.trim();
  if (stop === "error" || stop === "aborted") {
    throw new Error(
      errorMessage
        ? `Image model failed (${params.provider}/${params.model}): ${errorMessage}`
        : `Image model failed (${params.provider}/${params.model})`,
    );
  }
  if (errorMessage) {
    throw new Error(`Image model failed (${params.provider}/${params.model}): ${errorMessage}`);
  }
  const text = extractAssistantText(params.message);
  if (text.trim()) {
    return text.trim();
  }
  throw new Error(`Image model returned no text (${params.provider}/${params.model}).`);
}

export function coerceImageModelConfig(cfg?: { agents?: { defaults?: { imageModel?: ImageModelConfig } } }): ImageModelConfig {
  return coerceToolModelConfig(cfg?.agents?.defaults?.imageModel);
}

function normalizeProviderId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

function formatConfiguredImageModelRef(provider: string, modelId: string): string {
  const slash = modelId.indexOf("/");
  if (slash > 0 && normalizeProviderId(modelId.slice(0, slash)) === provider) {
    return modelId;
  }
  return `${provider}/${modelId}`;
}

function modelIdMatchesProviderlessRef(params: {
  provider: string;
  modelId: string;
  ref: string;
}): boolean {
  const candidates = new Set([params.modelId]);
  const slash = params.modelId.indexOf("/");
  if (slash > 0 && normalizeProviderId(params.modelId.slice(0, slash)) === params.provider) {
    candidates.add(params.modelId.slice(slash + 1));
  }
  const normalizedRef = normalizeLowercaseStringOrEmpty(params.ref);
  for (const candidate of candidates) {
    if (candidate === params.ref || normalizeLowercaseStringOrEmpty(candidate) === normalizedRef) {
      return true;
    }
  }
  return false;
}

type ModelConfig = {
  models?: {
    providers?: Record<string, { models?: Array<{ id?: string; input?: string[] }> }>;
  };
};

function findConfiguredImageModelMatches(params: { cfg?: ModelConfig; ref: string }): string[] {
  const providers = params.cfg?.models?.providers;
  if (!providers || typeof providers !== "object") {
    return [];
  }

  const matches = new Set<string>();
  for (const [providerKey, providerConfig] of Object.entries(providers)) {
    const provider = normalizeProviderId(providerKey);
    if (!provider || !Array.isArray(providerConfig?.models)) {
      continue;
    }
    for (const entry of providerConfig.models) {
      const modelId = entry?.id?.trim();
      if (!modelId || !Array.isArray(entry?.input) || !entry.input.includes("image")) {
        continue;
      }
      if (!modelIdMatchesProviderlessRef({ provider, modelId, ref: params.ref })) {
        continue;
      }
      matches.add(formatConfiguredImageModelRef(provider, modelId));
    }
  }
  return [...matches];
}

function resolveProviderlessConfiguredImageModelRef(params: {
  cfg?: ModelConfig;
  ref: string;
}): string {
  const ref = params.ref.trim();
  if (!ref || ref.includes("/")) {
    return ref;
  }

  const matches = findConfiguredImageModelMatches({ cfg: params.cfg, ref });
  if (matches.length === 0) {
    return ref;
  }
  if (matches.length === 1) {
    return matches[0];
  }
  throw new Error(
    `Ambiguous image model "${ref}". Configure a provider-prefixed ref such as ${matches
      .map((match) => `"${match}"`)
      .join(" or ")}.`,
  );
}

export function resolveConfiguredImageModelRefs(params: {
  cfg?: ModelConfig;
  imageModelConfig: ImageModelConfig;
}): ImageModelConfig {
  const primary = params.imageModelConfig.primary?.trim();
  const fallbacks = params.imageModelConfig.fallbacks
    ?.map((ref) => resolveProviderlessConfiguredImageModelRef({ cfg: params.cfg, ref }))
    .filter((ref) => ref.length > 0);

  return {
    ...(params.imageModelConfig.primary !== undefined
      ? {
          primary: primary
            ? resolveProviderlessConfiguredImageModelRef({ cfg: params.cfg, ref: primary })
            : primary,
        }
      : {}),
    ...(fallbacks && fallbacks.length > 0 ? { fallbacks } : {}),
    ...(params.imageModelConfig.timeoutMs !== undefined
      ? { timeoutMs: params.imageModelConfig.timeoutMs }
      : {}),
  };
}

export function resolveProviderVisionModelFromConfig(params: {
  cfg?: ModelConfig;
  provider: string;
}): string | null {
  const providers = params.cfg?.models?.providers;
  if (!providers || typeof providers !== "object") {
    return null;
  }
  const providerCfg = providers[params.provider];
  const models = (providerCfg as { models?: Array<{ id?: string; input?: string[] }> } | undefined)?.models ?? [];
  const picked = models.find((m) => Boolean((m?.id ?? "").trim()) && m.input?.includes("image"));
  const id = (picked?.id ?? "").trim();
  if (!id) {
    return null;
  }
  const slash = id.indexOf("/");
  const idProvider = slash === -1 ? "" : normalizeLowercaseStringOrEmpty(id.slice(0, slash));
  const selectedProvider = normalizeLowercaseStringOrEmpty(params.provider);
  return idProvider && idProvider === selectedProvider ? id : `${params.provider}/${id}`;
}

function coerceToolModelConfig(model?: ImageModelConfig): ImageModelConfig {
  const primary = model?.primary?.trim();
  const fallbacks = model?.fallbacks?.filter((f) => f.trim().length > 0) ?? [];
  const timeoutMs = model?.timeoutMs;
  return {
    ...(primary ? { primary } : {}),
    ...(fallbacks.length > 0 ? { fallbacks } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}
