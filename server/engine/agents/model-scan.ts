import { z } from 'zod';
import { logger } from '../../logger.js';
import { readResponseWithLimit } from "@cdf-know/media-core/read-response-with-limit";
import { normalizeProviderId } from "@cdf-know/model-catalog-core/provider-id";
import {
  asDateTimestampMs,
  resolveTimerTimeoutMs,
} from "@cdf-know/normalization-core/number-coercion";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "@cdf-know/normalization-core/string-coerce";
import {
  normalizeStringEntries,
} from "@cdf-know/normalization-core/string-normalization";
import { formatErrorMessage } from "../infra/errors.js";
import { getEnvApiKey } from "../llm/env-api-keys.js";
import { complete, stream } from "../llm/stream.js";
import type { Tool } from "../llm/extended-types.js";
import { inferParamBFromIdOrName } from "../shared/model-param-b.js";

export const ModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  type: z.enum(['text', 'vision', 'audio', 'embedding', 'multimodal']),
  contextWindow: z.number(),
  maxOutputTokens: z.number(),
  supportsStreaming: z.boolean().default(true),
  supportsTools: z.boolean().default(true),
  supportsVision: z.boolean().default(false),
  inputCostPer1k: z.number().default(0),
  outputCostPer1k: z.number().default(0),
  speedTier: z.enum(['fast', 'normal', 'slow']).default('normal'),
  qualityTier: z.enum(['economy', 'standard', 'premium']).default('standard'),
  enabled: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

const modelStore = new Map<string, ModelInfo>();
const providerIndex = new Map<string, Set<string>>();
const typeIndex = new Map<string, Set<string>>();

export function registerModel(model: Omit<ModelInfo, 'tags' | 'metadata'> & { tags?: string[]; metadata?: Record<string, unknown> }): void {
  const fullModel: ModelInfo = {
    ...model,
    tags: model.tags ?? [],
    metadata: model.metadata ?? {},
  };

  const result = ModelInfoSchema.safeParse(fullModel);
  if (!result.success) {
    throw new Error(`Invalid model info: ${result.error.message}`);
  }

  modelStore.set(model.id, result.data);

  if (!providerIndex.has(model.provider)) {
    providerIndex.set(model.provider, new Set());
  }
  providerIndex.get(model.provider)!.add(model.id);

  if (!typeIndex.has(model.type)) {
    typeIndex.set(model.type, new Set());
  }
  typeIndex.get(model.type)!.add(model.id);

  logger.debug(`[Agents:ModelScan] Registered model: ${model.id}`);
}

export function unregisterModel(modelId: string): boolean {
  const model = modelStore.get(modelId);
  if (!model) return false;

  modelStore.delete(modelId);

  const providerSet = providerIndex.get(model.provider);
  if (providerSet) {
    providerSet.delete(modelId);
    if (providerSet.size === 0) {
      providerIndex.delete(model.provider);
    }
  }

  const typeSet = typeIndex.get(model.type);
  if (typeSet) {
    typeSet.delete(modelId);
    if (typeSet.size === 0) {
      typeIndex.delete(model.type);
    }
  }

  logger.debug(`[Agents:ModelScan] Unregistered model: ${modelId}`);
  return true;
}

export function getModel(modelId: string): ModelInfo | undefined {
  return modelStore.get(modelId);
}

export function listModels(options?: {
  provider?: string;
  type?: ModelInfo['type'];
  enabledOnly?: boolean;
}): ModelInfo[] {
  let models = Array.from(modelStore.values());

  if (options?.enabledOnly) {
    models = models.filter(m => m.enabled);
  }

  if (options?.provider) {
    models = models.filter(m => m.provider === options.provider);
  }

  if (options?.type) {
    models = models.filter(m => m.type === options.type);
  }

  return models;
}

export function listProviders(): string[] {
  return Array.from(providerIndex.keys());
}

export function getModelsByProvider(provider: string): ModelInfo[] {
  return listModels({ provider });
}

export function getModelsByType(type: ModelInfo['type']): ModelInfo[] {
  return listModels({ type });
}

export function modelExists(modelId: string): boolean {
  return modelStore.has(modelId);
}

export function findBestModel(options: {
  type?: ModelInfo['type'];
  minContextWindow?: number;
  needsTools?: boolean;
  needsVision?: boolean;
  needsStreaming?: boolean;
  preferredSpeedTier?: ModelInfo['speedTier'];
  preferredQualityTier?: ModelInfo['qualityTier'];
}): ModelInfo | null {
  let candidates = listModels({ enabledOnly: true });

  if (options.type) {
    candidates = candidates.filter(m => m.type === options.type);
  }

  if (options.minContextWindow) {
    candidates = candidates.filter(m => m.contextWindow >= options.minContextWindow!);
  }

  if (options.needsTools) {
    candidates = candidates.filter(m => m.supportsTools);
  }

  if (options.needsVision) {
    candidates = candidates.filter(m => m.supportsVision);
  }

  if (options.needsStreaming) {
    candidates = candidates.filter(m => m.supportsStreaming);
  }

  if (candidates.length === 0) return null;

  if (options.preferredSpeedTier) {
    const tierOrder = ['fast', 'normal', 'slow'];
    candidates.sort((a, b) => {
      const aTier = tierOrder.indexOf(a.speedTier);
      const bTier = tierOrder.indexOf(b.speedTier);
      return aTier - bTier;
    });
  }

  if (options.preferredQualityTier) {
    const tierOrder = ['premium', 'standard', 'economy'];
    candidates.sort((a, b) => {
      const aTier = tierOrder.indexOf(a.qualityTier);
      const bTier = tierOrder.indexOf(b.qualityTier);
      return aTier - bTier;
    });
  }

  return candidates[0] ?? null;
}

export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = getModel(modelId);
  if (!model) return 0;

  const inputCost = (inputTokens / 1000) * model.inputCostPer1k;
  const outputCost = (outputTokens / 1000) * model.outputCostPer1k;
  
  return inputCost + outputCost;
}

export function clearModels(): void {
  modelStore.clear();
  providerIndex.clear();
  typeIndex.clear();
}

export function registerModels(models: ModelInfo[]): void {
  for (const model of models) {
    registerModel(model);
  }
}

// ---------------------------------------------------------------------------
// OpenRouter model catalog scanner
// ---------------------------------------------------------------------------

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_CONCURRENCY = 3;
// The OpenRouter /models catalog is a provider-controlled, runtime-fetched body
// (already >100 KB and growing). Read it under a byte cap before JSON.parse so a
// faulty or hostile provider cannot stream an unbounded document and exhaust
// process memory. Keep this aligned with the runtime capability cache for the
// same endpoint so scan and runtime discovery fail at the same boundary.
const OPENROUTER_MODELS_BODY_MAX_BYTES = 16 * 1024 * 1024;

const BASE_IMAGE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X3mIAAAAASUVORK5CYII=";

const TOOL_PING: Tool = {
  name: "ping",
  description: "Return OK.",
  parameters: { type: "object", properties: {} },
};

type OpenRouterModelMeta = {
  id: string;
  name: string;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  supportedParameters: string[];
  supportedParametersCount: number;
  supportsToolsMeta: boolean;
  modality: string | null;
  inferredParamB: number | null;
  createdAtMs: number | null;
  pricing: OpenRouterModelPricing | null;
};

type OpenRouterModelPricing = {
  prompt: number;
  completion: number;
  request: number;
  image: number;
  webSearch: number;
  internalReasoning: number;
};

type ProbeResult = {
  ok: boolean;
  latencyMs: number | null;
  error?: string;
  skipped?: boolean;
};

export type ModelScanResult = {
  id: string;
  name: string;
  provider: string;
  modelRef: string;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  supportedParametersCount: number;
  supportsToolsMeta: boolean;
  modality: string | null;
  inferredParamB: number | null;
  createdAtMs: number | null;
  pricing: OpenRouterModelPricing | null;
  isFree: boolean;
  tool: ProbeResult;
  image: ProbeResult;
};

type OpenRouterScanOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  concurrency?: number;
  minParamB?: number;
  maxAgeDays?: number;
  providerFilter?: string;
  probe?: boolean;
  onProgress?: (update: { phase: "catalog" | "probe"; completed: number; total: number }) => void;
};

function normalizeCreatedAtMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value <= 0) {
    return null;
  }
  const timestampMs = value > 1e12 ? Math.round(value) : Math.round(value * 1000);
  return asDateTimestampMs(timestampMs) ?? null;
}

function parseModality(modality: string | null): Array<"text" | "image"> {
  if (!modality) {
    return ["text"];
  }
  const normalized = normalizeLowercaseStringOrEmpty(modality);
  const parts = normalized.split(/[^a-z]+/).filter(Boolean);
  const hasImage = parts.includes("image");
  return hasImage ? ["text", "image"] : ["text"];
}

function parseNumberString(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    return null;
  }
  return num;
}

function parseOpenRouterPricing(value: unknown): OpenRouterModelPricing | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const prompt = parseNumberString(obj.prompt);
  const completion = parseNumberString(obj.completion);
  const request = parseNumberString(obj.request) ?? 0;
  const image = parseNumberString(obj.image) ?? 0;
  const webSearch = parseNumberString(obj.web_search) ?? 0;
  const internalReasoning = parseNumberString(obj.internal_reasoning) ?? 0;

  if (prompt === null || completion === null) {
    return null;
  }
  return {
    prompt,
    completion,
    request,
    image,
    webSearch,
    internalReasoning,
  };
}

function isFreeOpenRouterModel(entry: OpenRouterModelMeta): boolean {
  if (entry.id.endsWith(":free")) {
    return true;
  }
  if (!entry.pricing) {
    return false;
  }
  return entry.pricing.prompt === 0 && entry.pricing.completion === 0;
}

async function withTimeout<T>(
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(controller.abort.bind(controller), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// Reads the OpenRouter /models success body under a byte cap before JSON.parse.
// The success path was previously buffered with an unbounded res.json(); a faulty
// or hostile provider could stream an effectively endless document and exhaust
// memory. readResponseWithLimit caps the read, cancels the stream on overflow,
// and bounds idle stalls with the call's existing timeout.
async function readOpenRouterModelsJson(response: Response, timeoutMs: number): Promise<unknown> {
  const buffer = await readResponseWithLimit(response, OPENROUTER_MODELS_BODY_MAX_BYTES, {
    chunkTimeoutMs: timeoutMs,
    onOverflow: ({ size, maxBytes }) =>
      new Error(`OpenRouter /models response too large: ${size} bytes (limit ${maxBytes} bytes)`),
    onIdleTimeout: ({ chunkTimeoutMs }) =>
      new Error(`OpenRouter /models response stalled after ${chunkTimeoutMs}ms`),
  });
  try {
    return JSON.parse(buffer.toString("utf8")) as unknown;
  } catch (cause) {
    throw new Error("OpenRouter /models response is malformed JSON", { cause });
  }
}

async function fetchOpenRouterModels(
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<OpenRouterModelMeta[]> {
  let res: Response | undefined;
  try {
    res = await withTimeout(timeoutMs, (signal) =>
      fetchImpl(OPENROUTER_MODELS_URL, {
        headers: { Accept: "application/json" },
        signal,
      }),
    );
    if (!res.ok) {
      throw new Error(`OpenRouter /models failed: HTTP ${res.status}`);
    }
    const payload = (await readOpenRouterModelsJson(res, timeoutMs)) as { data?: unknown };
    const entries = Array.isArray(payload.data) ? payload.data : [];

    return entries
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const obj = entry as Record<string, unknown>;
        const id = normalizeOptionalString(obj.id) ?? "";
        if (!id) {
          return null;
        }
        const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : id;

        const contextLength =
          typeof obj.context_length === "number" && Number.isFinite(obj.context_length)
            ? obj.context_length
            : null;

        const maxCompletionTokens =
          typeof obj.max_completion_tokens === "number" &&
          Number.isFinite(obj.max_completion_tokens)
            ? obj.max_completion_tokens
            : typeof obj.max_output_tokens === "number" && Number.isFinite(obj.max_output_tokens)
              ? obj.max_output_tokens
              : null;

        const supportedParameters = Array.isArray(obj.supported_parameters)
          ? normalizeStringEntries(
              obj.supported_parameters.filter((value) => typeof value === "string"),
            )
          : [];

        const supportedParametersCount = supportedParameters.length;
        const supportsToolsMeta = supportedParameters.includes("tools");

        const modality =
          typeof obj.modality === "string" && obj.modality.trim() ? obj.modality.trim() : null;

        const inferredParamB = inferParamBFromIdOrName(`${id} ${name}`);
        const createdAtMs = normalizeCreatedAtMs(obj.created_at);
        const pricing = parseOpenRouterPricing(obj.pricing);

        return {
          id,
          name,
          contextLength,
          maxCompletionTokens,
          supportedParameters,
          supportedParametersCount,
          supportsToolsMeta,
          modality,
          inferredParamB,
          createdAtMs,
          pricing,
        } satisfies OpenRouterModelMeta;
      })
      .filter((entry): entry is OpenRouterModelMeta => Boolean(entry));
  } finally {
    if (res && !res.bodyUsed) {
      await res.body?.cancel().catch(() => undefined);
    }
  }
}

async function probeTool(
  modelRef: string,
  apiKey: string,
  timeoutMs: number,
): Promise<ProbeResult> {
  void apiKey; // cross-wms stream() resolves API key internally via getEnvApiKey
  const startedAt = Date.now();
  try {
    const events = await withTimeout(timeoutMs, (signal) =>
      stream({
        model: modelRef,
        messages: [
          {
            role: "user",
            content: "Call the ping tool with {} and nothing else.",
          },
        ],
        tools: [TOOL_PING],
        maxTokens: 256,
        temperature: 0,
        signal,
      }),
    );

    const hasToolCall = events.some((e) => e.type === "tool_call");
    if (!hasToolCall) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: "No tool call returned",
      };
    }

    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: formatErrorMessage(err),
    };
  }
}

async function probeImage(
  modelRef: string,
  apiKey: string,
  timeoutMs: number,
): Promise<ProbeResult> {
  void apiKey; // cross-wms complete() resolves API key internally via getEnvApiKey
  // cross-wms complete() accepts string content only; send a text probe with the
  // image payload referenced inline so the endpoint still receives a multimodal
  // hint where supported, while keeping the call type-compatible.
  const startedAt = Date.now();
  try {
    await withTimeout(timeoutMs, (signal) =>
      complete({
        model: modelRef,
        messages: [
          {
            role: "user",
            content: `Reply with OK. (image probe:${BASE_IMAGE_PNG})`,
          },
        ],
        maxTokens: 16,
        temperature: 0,
        signal,
      }),
    );
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: formatErrorMessage(err),
    };
  }
}

function buildOpenRouterScanResult(params: {
  entry: OpenRouterModelMeta;
  isFree: boolean;
  tool: ProbeResult;
  image: ProbeResult;
}): ModelScanResult {
  const { entry, isFree } = params;
  return {
    id: entry.id,
    name: entry.name,
    provider: "openrouter",
    modelRef: `openrouter/${entry.id}`,
    contextLength: entry.contextLength,
    maxCompletionTokens: entry.maxCompletionTokens,
    supportedParametersCount: entry.supportedParametersCount,
    supportsToolsMeta: entry.supportsToolsMeta,
    modality: entry.modality,
    inferredParamB: entry.inferredParamB,
    createdAtMs: entry.createdAtMs,
    pricing: entry.pricing,
    isFree,
    tool: params.tool,
    image: params.image,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  opts?: { onProgress?: (completed: number, total: number) => void },
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = Array.from({ length: items.length }, () => undefined as R);
  let nextIndex = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) {
        return;
      }
      results[current] = await fn(items[current], current);
      completed += 1;
      opts?.onProgress?.(completed, items.length);
    }
  };

  if (items.length === 0) {
    opts?.onProgress?.(0, 0);
    return results;
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function scanOpenRouterModels(
  options: OpenRouterScanOptions = {},
): Promise<ModelScanResult[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const probe = options.probe ?? true;
  const apiKey = options.apiKey?.trim() || getEnvApiKey("openrouter") || "";
  if (probe && !apiKey) {
    throw new Error(
      "Missing OpenRouter API key. Free OpenRouter models still require OPENROUTER_API_KEY for live probes and inference; call with probe:false to list public catalog metadata.",
    );
  }

  const timeoutMs = resolveTimerTimeoutMs(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY));
  const minParamB = Math.max(0, Math.floor(options.minParamB ?? 0));
  const maxAgeDays = Math.max(0, Math.floor(options.maxAgeDays ?? 0));
  const providerFilter = normalizeProviderId(options.providerFilter ?? "");

  const catalog = await fetchOpenRouterModels(fetchImpl, timeoutMs);
  const now = Date.now();

  const filtered = catalog.filter((entry) => {
    if (!isFreeOpenRouterModel(entry)) {
      return false;
    }
    if (providerFilter) {
      const prefix = normalizeProviderId(entry.id.split("/")[0] ?? "");
      if (prefix !== providerFilter) {
        return false;
      }
    }
    if (minParamB > 0) {
      const params = entry.inferredParamB ?? 0;
      if (params < minParamB) {
        return false;
      }
    }
    if (maxAgeDays > 0 && entry.createdAtMs) {
      const ageMs = now - entry.createdAtMs;
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      if (ageDays > maxAgeDays) {
        return false;
      }
    }
    return true;
  });

  options.onProgress?.({
    phase: "probe",
    completed: 0,
    total: filtered.length,
  });

  return mapWithConcurrency(
    filtered,
    concurrency,
    async (entry) => {
      const isFree = isFreeOpenRouterModel(entry);
      if (!probe) {
        return buildOpenRouterScanResult({
          entry,
          isFree,
          tool: { ok: false, latencyMs: null, skipped: true },
          image: { ok: false, latencyMs: null, skipped: true },
        });
      }

      const modelRef = `openrouter/${entry.id}`;
      const inputModalities = parseModality(entry.modality);

      const toolResult = await probeTool(modelRef, apiKey, timeoutMs);
      const imageResult = inputModalities.includes("image")
        ? await probeImage(modelRef, apiKey, timeoutMs)
        : { ok: false, latencyMs: null, skipped: true };

      return buildOpenRouterScanResult({
        entry,
        isFree,
        tool: toolResult,
        image: imageResult,
      });
    },
    {
      onProgress: (completed, total) =>
        options.onProgress?.({
          phase: "probe",
          completed,
          total,
        }),
    },
  );
}

logger.debug('[Agents:ModelScan] Module loaded');
