/**
 * 移植自 openclaw/src/agents/live-model-filter.ts
 *
 * Live model sweep filtering and prioritization.
 * Curates modern high-signal and small-model refs while preserving provider
 * spread and explicit operator selections for live test lanes.
 * Simplified for cross-wms: resolveProviderModernModelRef is stubbed to
 * return undefined (no plugin system).
 */

type ModelRef = {
  provider?: string | null;
  id?: string | null;
};

const HIGH_SIGNAL_LIVE_MODEL_PRIORITY = [
  "anthropic/claude-opus-4-8",
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-opus-4-7",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3-flash-preview",
  "moonshot/kimi-k2.7-code",
  "anthropic/claude-opus-4-6",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
  "minimax/minimax-m3",
  "openai/gpt-5.5",
  "openrouter/openai/gpt-5.2-chat",
  "openrouter/minimax/minimax-m2.7",
  "opencode-go/glm-5",
  "openrouter/ai21/jamba-large-1.7",
  "xai/grok-4.3",
  "zai/glm-5.1",
  "fireworks/accounts/fireworks/models/glm-5p1",
  "minimax-portal/minimax-m3",
] as const;

const SMALL_LIVE_MODEL_PRIORITY = [
  "lmstudio/qwen/qwen3.5-9b",
  "vllm/qwen/qwen3-8b",
  "sglang/qwen/qwen3-8b",
  "ollama/gemma3:4b",
  "openrouter/qwen/qwen3.5-9b",
  "openrouter/z-ai/glm-5.1",
  "openrouter/z-ai/glm-5",
  "zai/glm-5.1",
] as const;

/** Default cap for high-signal live model sweeps. */
export const DEFAULT_HIGH_SIGNAL_LIVE_MODEL_LIMIT = HIGH_SIGNAL_LIVE_MODEL_PRIORITY.length;
/** Default cap for the small-model live smoke lane. */
export const DEFAULT_SMALL_LIVE_MODEL_LIMIT = SMALL_LIVE_MODEL_PRIORITY.length;
const DEFAULT_HIGH_SIGNAL_LIVE_EXCLUDED_PROVIDERS = new Set(["codex", "codex-cli"]);

const HIGH_SIGNAL_LIVE_MODEL_PRIORITY_INDEX = new Map<string, number>(
  HIGH_SIGNAL_LIVE_MODEL_PRIORITY.map((key, index) => [key, index]),
);
const SMALL_LIVE_MODEL_PRIORITY_INDEX = new Map<string, number>(
  SMALL_LIVE_MODEL_PRIORITY.map((key, index) => [key, index]),
);
const HIGH_SIGNAL_LIVE_MODEL_IDS_BY_PROVIDER = new Map<string, Set<string>>();
for (const key of HIGH_SIGNAL_LIVE_MODEL_PRIORITY) {
  const separatorIndex = key.indexOf("/");
  if (separatorIndex < 0) {
    continue;
  }
  const provider = key.slice(0, separatorIndex);
  const id = key.slice(separatorIndex + 1);
  const bucket = HIGH_SIGNAL_LIVE_MODEL_IDS_BY_PROVIDER.get(provider);
  if (bucket) {
    bucket.add(id);
  } else {
    HIGH_SIGNAL_LIVE_MODEL_IDS_BY_PROVIDER.set(provider, new Set([id]));
  }
}

/** Return providers represented in the high-signal live model priority list. */
export function getHighSignalLiveModelProviders(): string[] {
  return [...HIGH_SIGNAL_LIVE_MODEL_IDS_BY_PROVIDER.keys()].toSorted((left, right) =>
    left.localeCompare(right),
  );
}

function isHighSignalClaudeModelId(id: string): boolean {
  const normalized = id.replace(/[_.]/g, "-");
  if (!/\bclaude\b/i.test(normalized)) {
    return true;
  }
  if (/\bhaiku\b/i.test(normalized)) {
    return false;
  }
  if (/\bclaude-3(?:[-.]5|[-.]7)\b/i.test(normalized)) {
    return false;
  }
  const versionMatch = normalized.match(/\bclaude-[a-z0-9-]*?-(\d+)(?:-(\d+))?(?:\b|[-])/i);
  if (!versionMatch) {
    return false;
  }
  const major = Number.parseInt(versionMatch[1] ?? "0", 10);
  const minor = Number.parseInt(versionMatch[2] ?? "0", 10);
  if (major > 4) {
    return true;
  }
  if (major < 4) {
    return false;
  }
  return minor >= 6;
}

function isPreGemini3ModelId(id: string): boolean {
  const normalized = id.trim().toLowerCase();
  const match = normalized.match(/(?:^|\/)gemini-(\d+)(?:[.-]|$)/);
  if (!match) {
    return false;
  }
  const major = Number.parseInt(match[1] ?? "0", 10);
  return Number.isFinite(major) && major < 3;
}

function isMutableLatestAliasLiveModelRef(id: string): boolean {
  const modelName = id.trim().toLowerCase().split("/").pop() ?? "";
  return modelName.endsWith("-latest");
}

function isUnsupportedOpenAiLiveModelRef(provider: string, id: string): boolean {
  const normalized = id.trim().toLowerCase();
  const modelName = normalized.split("/").pop() ?? "";
  if (provider === "openrouter") {
    if (!normalized.startsWith("openai/")) {
      return false;
    }
    return !modelName.startsWith("gpt-5.2");
  }
  if (provider === "openai") {
    return modelName !== "gpt-5.5";
  }
  const isOpenAiFamily =
    provider === "openai" ||
    provider === "codex-cli" ||
    provider === "opencode" ||
    provider === "github-copilot" ||
    provider === "microsoft-foundry";
  if (!isOpenAiFamily) {
    return false;
  }
  return true;
}

function isOldMiniMaxLiveModelRef(id: string): boolean {
  const modelName = id.trim().toLowerCase().split("/").pop() ?? "";
  return modelName === "minimax-m2.1" || modelName.startsWith("minimax-m2.1:");
}

function isOldGlmLiveModelRef(id: string): boolean {
  const modelName = id.trim().toLowerCase().split("/").pop() ?? "";
  return /^glm-4(?:$|[.\-p])/.test(modelName);
}

/** Return whether a provider/model ref is modern enough for live checks. */
export function isModernModelRef(ref: ModelRef): boolean {
  const provider = (ref.provider ?? "").trim().toLowerCase();
  const id = (ref.id ?? "").trim().toLowerCase();
  if (!provider || !id) {
    return false;
  }
  // Simplified: no plugin resolution; treat all well-formed refs as modern.
  return true;
}

/** Return whether a provider/model ref belongs in high-signal live sweeps. */
export function isHighSignalLiveModelRef(ref: ModelRef): boolean {
  const provider = (ref.provider ?? "").trim().toLowerCase();
  const id = (ref.id ?? "").trim().toLowerCase();
  if (!isModernModelRef(ref) || !id) {
    return false;
  }
  if (isPreGemini3ModelId(id)) {
    return false;
  }
  if (isMutableLatestAliasLiveModelRef(id)) {
    return false;
  }
  if (isUnsupportedOpenAiLiveModelRef(provider, id)) {
    return false;
  }
  if (isOldMiniMaxLiveModelRef(id)) {
    return false;
  }
  if (isOldGlmLiveModelRef(id)) {
    return false;
  }
  return isHighSignalClaudeModelId(id);
}

/** Return whether a ref is explicitly prioritized for high-signal live sweeps. */
export function isPrioritizedHighSignalLiveModelRef(ref: ModelRef): boolean {
  return hasPrioritizedLiveModelRef(HIGH_SIGNAL_LIVE_MODEL_PRIORITY_INDEX, ref);
}

/** Return whether a ref belongs to the curated small-model live lane. */
export function isSmallLiveModelRef(ref: ModelRef): boolean {
  return hasPrioritizedLiveModelRef(SMALL_LIVE_MODEL_PRIORITY_INDEX, ref);
}

/** List high-signal priority refs in priority order. */
export function listPrioritizedHighSignalLiveModelRefs(): Array<{ provider: string; id: string }> {
  return listPrioritizedLiveModelRefs(HIGH_SIGNAL_LIVE_MODEL_PRIORITY);
}

/** List small-model priority refs in priority order. */
export function listPrioritizedSmallLiveModelRefs(): Array<{ provider: string; id: string }> {
  return listPrioritizedLiveModelRefs(SMALL_LIVE_MODEL_PRIORITY);
}

function listPrioritizedLiveModelRefs(
  priority: readonly string[],
): Array<{ provider: string; id: string }> {
  return priority.map((key) => {
    const separatorIndex = key.indexOf("/");
    return {
      provider: key.slice(0, separatorIndex),
      id: key.slice(separatorIndex + 1),
    };
  });
}

/** Decide whether default high-signal sweeps should skip a provider. */
export function shouldExcludeProviderFromDefaultHighSignalLiveSweep(params: {
  provider?: string | null;
  useExplicitModels: boolean;
  providerFilter?: ReadonlySet<string> | null;
}): boolean {
  const provider = (params.provider ?? "").trim().toLowerCase();
  if (!provider || params.useExplicitModels) {
    return false;
  }
  if (!DEFAULT_HIGH_SIGNAL_LIVE_EXCLUDED_PROVIDERS.has(provider)) {
    return false;
  }
  for (const filterEntry of params.providerFilter ?? []) {
    const requestedProvider = filterEntry.trim().toLowerCase();
    if (requestedProvider === provider) {
      return false;
    }
    if (requestedProvider && DEFAULT_HIGH_SIGNAL_LIVE_EXCLUDED_PROVIDERS.has(requestedProvider)) {
      return false;
    }
  }
  return true;
}

function toCanonicalLiveModelKey(ref: ModelRef): string | null {
  const provider = (ref.provider ?? "").trim().toLowerCase();
  const rawId = (ref.id ?? "").trim().toLowerCase();
  if (!provider || !rawId) {
    return null;
  }
  return `${provider}/${rawId}`;
}

function hasPrioritizedLiveModelRef(index: ReadonlyMap<string, number>, ref: ModelRef): boolean {
  const key = toCanonicalLiveModelKey(ref);
  return key !== null && index.has(key);
}

function capByProviderSpread<T>(
  items: T[],
  maxItems: number,
  providerOf: (item: T) => string,
): T[] {
  if (maxItems <= 0 || items.length <= maxItems) {
    return items;
  }
  const providerOrder: string[] = [];
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const provider = providerOf(item);
    const bucket = grouped.get(provider);
    if (bucket) {
      bucket.push(item);
      continue;
    }
    providerOrder.push(provider);
    grouped.set(provider, [item]);
  }

  const selected: T[] = [];
  while (selected.length < maxItems && grouped.size > 0) {
    for (const provider of providerOrder) {
      const bucket = grouped.get(provider);
      if (!bucket || bucket.length === 0) {
        continue;
      }
      const item = bucket.shift();
      if (item) {
        selected.push(item);
      }
      if (bucket.length === 0) {
        grouped.delete(provider);
      }
      if (selected.length >= maxItems) {
        break;
      }
    }
  }
  return selected;
}

/** Select high-signal live items by explicit priority, then provider spread. */
export function selectHighSignalLiveItems<T>(
  items: T[],
  maxItems: number,
  refOf: (item: T) => ModelRef,
  providerOf: (item: T) => string,
): T[] {
  return selectPrioritizedLiveItems(
    items,
    maxItems,
    refOf,
    providerOf,
    HIGH_SIGNAL_LIVE_MODEL_PRIORITY,
  );
}

/** Select small live items by explicit priority, then provider spread. */
export function selectSmallLiveItems<T>(
  items: T[],
  maxItems: number,
  refOf: (item: T) => ModelRef,
  providerOf: (item: T) => string,
): T[] {
  return selectPrioritizedLiveItems(items, maxItems, refOf, providerOf, SMALL_LIVE_MODEL_PRIORITY);
}

function selectPrioritizedLiveItems<T>(
  items: T[],
  maxItems: number,
  refOf: (item: T) => ModelRef,
  providerOf: (item: T) => string,
  priority: readonly string[],
): T[] {
  if (maxItems <= 0 || items.length <= maxItems) {
    return items;
  }

  const remaining = [...items];
  const selected: T[] = [];
  for (const preferredKey of priority) {
    if (selected.length >= maxItems) {
      break;
    }
    const preferredIndex = remaining.findIndex(
      (item) => toCanonicalLiveModelKey(refOf(item)) === preferredKey,
    );
    if (preferredIndex < 0) {
      continue;
    }
    const [preferred] = remaining.splice(preferredIndex, 1);
    if (preferred) {
      selected.push(preferred);
    }
  }

  if (selected.length >= maxItems || remaining.length === 0) {
    return selected.slice(0, maxItems);
  }

  return [...selected, ...capByProviderSpread(remaining, maxItems - selected.length, providerOf)];
}

/** Resolve the high-signal live model cap from CLI/config inputs. */
export function resolveHighSignalLiveModelLimit(params: {
  rawMaxModels?: string;
  useExplicitModels: boolean;
  defaultLimit?: number;
}): number {
  const trimmed = params.rawMaxModels?.trim();
  if (trimmed) {
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
    return 0;
  }
  if (params.useExplicitModels) {
    return 0;
  }
  return params.defaultLimit ?? DEFAULT_HIGH_SIGNAL_LIVE_MODEL_LIMIT;
}

/** Return the priority index for a high-signal live ref, if prioritized. */
export function getHighSignalLiveModelPriorityIndex(ref: ModelRef): number | null {
  const key = toCanonicalLiveModelKey(ref);
  if (!key) {
    return null;
  }
  return HIGH_SIGNAL_LIVE_MODEL_PRIORITY_INDEX.get(key) ?? null;
}
