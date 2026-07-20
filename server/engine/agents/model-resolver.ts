/**
 * Model resolution, scoping, and initial selection.
 * Ported from openclaw/src/agents/sessions/model-resolver.ts
 *
 * Note: Full model registry infrastructure is not available in cross-wms.
 * Core logic is preserved; registry operations return sensible defaults.
 */

type Model = {
  id: string;
  provider: string;
  name?: string;
};

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ScopedModel {
  model: Model;
  thinkingLevel?: ThinkingLevel;
}

export interface ParsedModelResult {
  model: Model | undefined;
  thinkingLevel?: ThinkingLevel;
  warning: string | undefined;
}

export interface ResolveCliModelResult {
  model: Model | undefined;
  thinkingLevel?: ThinkingLevel;
  warning: string | undefined;
  error: string | undefined;
}

export interface InitialModelResult {
  model: Model | undefined;
  thinkingLevel: ThinkingLevel;
  fallbackMessage: string | undefined;
}

const VALID_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

function isValidThinkingLevel(level: string): level is ThinkingLevel {
  return VALID_THINKING_LEVELS.includes(level as ThinkingLevel);
}

function isAlias(id: string): boolean {
  if (id.endsWith("-latest")) {
    return true;
  }
  const datePattern = /-\d{8}$/;
  return !datePattern.test(id);
}

/** Find an exact model reference match. */
export function findExactModelReferenceMatch(
  modelReference: string,
  availableModels: Model[],
): Model | undefined {
  const trimmedReference = modelReference.trim();
  if (!trimmedReference) {
    return undefined;
  }
  const normalizedReference = trimmedReference.toLowerCase();

  const canonicalMatches = availableModels.filter(
    (model) => `${model.provider}/${model.id}`.toLowerCase() === normalizedReference,
  );
  if (canonicalMatches.length === 1) {
    return canonicalMatches[0];
  }
  if (canonicalMatches.length > 1) {
    return undefined;
  }

  const slashIndex = trimmedReference.indexOf("/");
  if (slashIndex !== -1) {
    const provider = trimmedReference.slice(0, slashIndex).trim();
    const modelId = trimmedReference.slice(slashIndex + 1).trim();
    if (provider && modelId) {
      const providerMatches = availableModels.filter(
        (model) =>
          model.provider.toLowerCase() === provider.toLowerCase() &&
          model.id.toLowerCase() === modelId.toLowerCase(),
      );
      if (providerMatches.length === 1) {
        return providerMatches[0];
      }
      if (providerMatches.length > 1) {
        return undefined;
      }
    }
  }

  const idMatches = availableModels.filter(
    (model) => model.id.toLowerCase() === normalizedReference,
  );
  return idMatches.length === 1 ? idMatches[0] : undefined;
}

function tryMatchModel(modelPattern: string, availableModels: Model[]): Model | undefined {
  const exactMatch = findExactModelReferenceMatch(modelPattern, availableModels);
  if (exactMatch) {
    return exactMatch;
  }
  const matches = availableModels.filter(
    (m) =>
      m.id.toLowerCase().includes(modelPattern.toLowerCase()) ||
      m.name?.toLowerCase().includes(modelPattern.toLowerCase()),
  );
  if (matches.length === 0) {
    return undefined;
  }
  const aliases = matches.filter((m) => isAlias(m.id));
  const datedVersions = matches.filter((m) => !isAlias(m.id));
  if (aliases.length > 0) {
    aliases.sort((a, b) => b.id.localeCompare(a.id));
    return aliases[0];
  }
  datedVersions.sort((a, b) => b.id.localeCompare(a.id));
  return datedVersions[0];
}

/** Parse a pattern to extract model and thinking level. */
export function parseModelPattern(
  pattern: string,
  availableModels: Model[],
  options?: { allowInvalidThinkingLevelFallback?: boolean },
): ParsedModelResult {
  const exactMatch = tryMatchModel(pattern, availableModels);
  if (exactMatch) {
    return { model: exactMatch, thinkingLevel: undefined, warning: undefined };
  }
  const lastColonIndex = pattern.lastIndexOf(":");
  if (lastColonIndex === -1) {
    return { model: undefined, thinkingLevel: undefined, warning: undefined };
  }
  const prefix = pattern.slice(0, lastColonIndex);
  const suffix = pattern.slice(lastColonIndex + 1);
  if (isValidThinkingLevel(suffix)) {
    const result = parseModelPattern(prefix, availableModels, options);
    if (result.model) {
      return {
        model: result.model,
        thinkingLevel: result.warning ? undefined : suffix,
        warning: result.warning,
      };
    }
    return result;
  }
  const allowFallback = options?.allowInvalidThinkingLevelFallback ?? true;
  if (!allowFallback) {
    return { model: undefined, thinkingLevel: undefined, warning: undefined };
  }
  const result = parseModelPattern(prefix, availableModels, options);
  if (result.model) {
    return {
      model: result.model,
      thinkingLevel: undefined,
      warning: `Invalid thinking level "${suffix}" in pattern "${pattern}". Using default instead.`,
    };
  }
  return result;
}

/** Resolve model patterns to actual Model objects with optional thinking levels. */
export async function resolveModelScope(
  _patterns: string[],
  _modelRegistry: unknown,
): Promise<ScopedModel[]> {
  // Full model registry not available in cross-wms
  return [];
}

/** Resolve a single model from CLI flags. */
export function resolveCliModel(options: {
  cliProvider?: string;
  cliModel?: string;
  modelRegistry: unknown;
}): ResolveCliModelResult {
  if (!options.cliModel) {
    return { model: undefined, warning: undefined, error: undefined };
  }
  return {
    model: undefined,
    warning: undefined,
    error: `Model "${options.cliModel}" not found. Model registry not available in cross-wms.`,
  };
}

/** Find the initial model to use based on priority. */
export async function findInitialModel(options: {
  cliProvider?: string;
  cliModel?: string;
  scopedModels: ScopedModel[];
  isContinuing: boolean;
  defaultProvider?: string;
  defaultModelId?: string;
  defaultThinkingLevel?: ThinkingLevel;
  modelRegistry: unknown;
}): Promise<InitialModelResult> {
  if (options.scopedModels.length > 0 && !options.isContinuing) {
    return {
      model: options.scopedModels[0].model,
      thinkingLevel: options.scopedModels[0].thinkingLevel ?? options.defaultThinkingLevel ?? "off",
      fallbackMessage: undefined,
    };
  }
  return { model: undefined, thinkingLevel: "off", fallbackMessage: undefined };
}

/** Restore model from session, with fallback to available models. */
export async function restoreModelFromSession(
  _savedProvider: string,
  _savedModelId: string,
  currentModel: Model | undefined,
  _shouldPrintMessages: boolean,
  _modelRegistry: unknown,
): Promise<{ model: Model | undefined; fallbackMessage: string | undefined }> {
  // Full model registry not available in cross-wms
  if (currentModel) {
    return { model: currentModel, fallbackMessage: undefined };
  }
  return { model: undefined, fallbackMessage: undefined };
}
