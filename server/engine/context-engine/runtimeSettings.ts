import type {
  ContextEngineRuntimeSettings,
  ContextEngineRuntimeMode,
  ContextEngineRuntimeReasonCode,
  ContextEngineSelectionSource,
  ContextEngineRuntimeContext,
} from './types.js';

const RUNTIME_SETTINGS_SCHEMA_VERSION = 1;
const DEFAULT_HOST = 'cross-wms';

function createDefaultRuntimeSettings(
  overrides?: Partial<ContextEngineRuntimeSettings>
): ContextEngineRuntimeSettings {
  const base: ContextEngineRuntimeSettings = {
    schemaVersion: RUNTIME_SETTINGS_SCHEMA_VERSION,
    runtime: {
      host: DEFAULT_HOST,
      mode: 'normal',
      harnessId: null,
      runtimeId: null,
    },
    model: {
      requested: null,
      resolved: null,
      provider: null,
      family: null,
    },
    contextEngineSelection: {
      selectedId: null,
      source: 'unknown',
    },
    executionHost: {
      id: null,
      label: null,
    },
    limits: {
      promptTokenBudget: null,
      maxOutputTokens: null,
    },
    diagnostics: {
      fallbackReason: null,
      degradedReason: null,
    },
  };

  if (overrides) {
    return mergeRuntimeSettings(base, overrides);
  }

  return base;
}

function mergeRuntimeSettings(
  base: ContextEngineRuntimeSettings,
  overrides: Partial<ContextEngineRuntimeSettings>
): ContextEngineRuntimeSettings {
  return {
    schemaVersion: overrides.schemaVersion ?? base.schemaVersion,
    runtime: {
      ...base.runtime,
      ...(overrides.runtime || {}),
    },
    model: {
      ...base.model,
      ...(overrides.model || {}),
    },
    contextEngineSelection: {
      ...base.contextEngineSelection,
      ...(overrides.contextEngineSelection || {}),
    },
    executionHost: {
      ...base.executionHost,
      ...(overrides.executionHost || {}),
    },
    limits: {
      ...base.limits,
      ...(overrides.limits || {}),
    },
    diagnostics: {
      ...base.diagnostics,
      ...(overrides.diagnostics || {}),
    },
  };
}

function withFallbackMode(
  settings: ContextEngineRuntimeSettings,
  reason: ContextEngineRuntimeReasonCode,
  fallbackEngineId: string
): ContextEngineRuntimeSettings {
  return {
    ...settings,
    runtime: {
      ...settings.runtime,
      mode: 'fallback',
    },
    contextEngineSelection: {
      selectedId: fallbackEngineId,
      source: 'default',
    },
    diagnostics: {
      ...settings.diagnostics,
      fallbackReason: reason,
    },
  };
}

function withDegradedMode(
  settings: ContextEngineRuntimeSettings,
  reason: ContextEngineRuntimeReasonCode
): ContextEngineRuntimeSettings {
  return {
    ...settings,
    runtime: {
      ...settings.runtime,
      mode: 'degraded',
    },
    diagnostics: {
      ...settings.diagnostics,
      degradedReason: reason,
    },
  };
}

function withSelectedEngine(
  settings: ContextEngineRuntimeSettings,
  engineId: string,
  source: ContextEngineSelectionSource
): ContextEngineRuntimeSettings {
  return {
    ...settings,
    contextEngineSelection: {
      selectedId: engineId,
      source,
    },
  };
}

function withModelInfo(
  settings: ContextEngineRuntimeSettings,
  model: {
    requested?: string | null;
    resolved?: string | null;
    provider?: string | null;
    family?: string | null;
  }
): ContextEngineRuntimeSettings {
  return {
    ...settings,
    model: {
      ...settings.model,
      ...model,
    },
  };
}

function withTokenLimits(
  settings: ContextEngineRuntimeSettings,
  limits: {
    promptTokenBudget?: number | null;
    maxOutputTokens?: number | null;
  }
): ContextEngineRuntimeSettings {
  return {
    ...settings,
    limits: {
      ...settings.limits,
      ...limits,
    },
  };
}

function runtimeSettingsToContext(
  settings: ContextEngineRuntimeSettings
): ContextEngineRuntimeContext {
  return {
    modelId: settings.model.resolved ?? settings.model.requested ?? undefined,
    provider: settings.model.provider ?? undefined,
    modelFamily: settings.model.family ?? undefined,
    tokenBudget: settings.limits.promptTokenBudget ?? undefined,
    maxOutputTokens: settings.limits.maxOutputTokens ?? undefined,
    runtimeMode: settings.runtime.mode,
    fallbackReason: settings.diagnostics.fallbackReason ?? undefined,
    degradedReason: settings.diagnostics.degradedReason ?? undefined,
  };
}

function contextToRuntimeSettings(
  ctx: ContextEngineRuntimeContext,
  base?: ContextEngineRuntimeSettings
): ContextEngineRuntimeSettings {
  const settings = base ?? createDefaultRuntimeSettings();
  const updates: Partial<ContextEngineRuntimeSettings> = {};

  if (ctx.modelId || ctx.provider || ctx.modelFamily) {
    updates.model = {
      requested: ctx.modelId ?? settings.model.requested,
      resolved: ctx.modelId ?? settings.model.resolved,
      provider: ctx.provider ?? settings.model.provider,
      family: ctx.modelFamily ?? settings.model.family,
    };
  }

  if (ctx.tokenBudget || ctx.maxOutputTokens) {
    updates.limits = {
      promptTokenBudget: ctx.tokenBudget ?? settings.limits.promptTokenBudget,
      maxOutputTokens: ctx.maxOutputTokens ?? settings.limits.maxOutputTokens,
    };
  }

  if (ctx.runtimeMode) {
    updates.runtime = {
      ...settings.runtime,
      mode: ctx.runtimeMode,
    };
  }

  if (ctx.fallbackReason) {
    updates.diagnostics = {
      ...settings.diagnostics,
      fallbackReason: ctx.fallbackReason,
    };
  }

  if (ctx.degradedReason) {
    updates.diagnostics = {
      ...settings.diagnostics,
      degradedReason: ctx.degradedReason,
    };
  }

  return mergeRuntimeSettings(settings, updates);
}

function describeRuntimeMode(mode: ContextEngineRuntimeMode): string {
  switch (mode) {
    case 'normal': return '正常模式';
    case 'fallback': return '降级回退模式';
    case 'degraded': return '降级运行模式';
    default: return mode;
  }
}

function getRuntimeDiagnosticsSummary(settings: ContextEngineRuntimeSettings): string {
  const parts: string[] = [];
  parts.push(`mode=${settings.runtime.mode}`);

  if (settings.contextEngineSelection.selectedId) {
    parts.push(`engine=${settings.contextEngineSelection.selectedId}`);
    parts.push(`source=${settings.contextEngineSelection.source}`);
  }

  if (settings.model.resolved) {
    parts.push(`model=${settings.model.resolved}`);
  }

  if (settings.diagnostics.fallbackReason) {
    parts.push(`fallback=${settings.diagnostics.fallbackReason}`);
  }

  if (settings.diagnostics.degradedReason) {
    parts.push(`degraded=${settings.diagnostics.degradedReason}`);
  }

  return parts.join(', ');
}

export {
  createDefaultRuntimeSettings,
  mergeRuntimeSettings,
  withFallbackMode,
  withDegradedMode,
  withSelectedEngine,
  withModelInfo,
  withTokenLimits,
  runtimeSettingsToContext,
  contextToRuntimeSettings,
  describeRuntimeMode,
  getRuntimeDiagnosticsSummary,
  RUNTIME_SETTINGS_SCHEMA_VERSION,
  DEFAULT_HOST,
};
