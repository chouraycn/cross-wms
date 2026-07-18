import { logger } from '../../logger.js';
import type {
  HookEntry,
  HookStatusEntry,
  HookStatusReport,
  HookStatusConfigCheck,
  HookInstallOption,
  HookEligibilityContext,
  HookConfig,
} from './types.js';

function resolveHookKey(entry: HookEntry): string {
  return entry.metadata?.hookKey ?? entry.hook.name;
}

function normalizeInstallOptions(entry: HookEntry): HookInstallOption[] {
  const install = entry.metadata?.install ?? [];
  if (install.length === 0) {
    return [];
  }

  return install.map((spec, index) => {
    const id = (spec.id ?? `${spec.kind}-${index}`).trim();
    const bins = spec.bins ?? [];
    let label = (spec.label ?? '').trim();

    if (!label) {
      if (spec.kind === 'bundled') {
        label = 'Bundled with cdf-know';
      } else if (spec.kind === 'npm' && spec.package) {
        label = `Install ${spec.package} (npm)`;
      } else if (spec.kind === 'git' && spec.repository) {
        label = `Install from ${spec.repository}`;
      } else {
        label = 'Run installer';
      }
    }

    return { id, kind: spec.kind, label, bins };
  });
}

function evaluateRequirements(
  entry: HookEntry,
  hasLocalBin: (bin: string) => boolean,
  isEnvSatisfied: (envName: string) => boolean,
  isConfigSatisfied: (path: string) => boolean,
  eligibility?: HookEligibilityContext,
): {
  requirements: { bins?: string[]; anyBins?: string[]; env?: string[]; config?: string[] };
  missing: { bins?: string[]; anyBins?: string[]; env?: string[]; config?: string[] };
  requirementsSatisfied: boolean;
  configChecks: HookStatusConfigCheck[];
} {
  const requires = entry.metadata?.requires;
  const requirements: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  } = {};
  const missing: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  } = {};
  const configChecks: HookStatusConfigCheck[] = [];
  let allSatisfied = true;

  if (requires?.bins && requires.bins.length > 0) {
    requirements.bins = [...requires.bins];
    const missingBins: string[] = [];
    for (const bin of requires.bins) {
      const localHas = hasLocalBin(bin);
      const remoteHas = eligibility?.remote?.hasBin?.(bin) ?? false;
      if (!localHas && !remoteHas) {
        missingBins.push(bin);
      }
    }
    if (missingBins.length > 0) {
      missing.bins = missingBins;
      allSatisfied = false;
    }
  }

  if (requires?.anyBins && requires.anyBins.length > 0) {
    requirements.anyBins = [...requires.anyBins];
    const hasAny = requires.anyBins.some((bin) => {
      const localHas = hasLocalBin(bin);
      const remoteHas = eligibility?.remote?.hasBin?.(bin) ?? false;
      return localHas || remoteHas;
    });
    if (!hasAny) {
      missing.anyBins = [...requires.anyBins];
      allSatisfied = false;
    }
  }

  if (requires?.env && requires.env.length > 0) {
    requirements.env = [...requires.env];
    const missingEnv: string[] = [];
    for (const envName of requires.env) {
      if (!isEnvSatisfied(envName)) {
        missingEnv.push(envName);
      }
    }
    if (missingEnv.length > 0) {
      missing.env = missingEnv;
      allSatisfied = false;
    }
  }

  if (requires?.config && requires.config.length > 0) {
    requirements.config = [...requires.config];
    const missingConfig: string[] = [];
    for (const configPath of requires.config) {
      const satisfied = isConfigSatisfied(configPath);
      configChecks.push({ path: configPath, satisfied, label: configPath });
      if (!satisfied) {
        missingConfig.push(configPath);
      }
    }
    if (missingConfig.length > 0) {
      missing.config = missingConfig;
      allSatisfied = false;
    }
  }

  return { requirements, missing, requirementsSatisfied: allSatisfied, configChecks };
}

function buildHookStatus(
  entry: HookEntry,
  hookConfig: HookConfig | undefined,
  enabledByConfig: boolean,
  blockedReason: string | undefined,
  hasLocalBin: (bin: string) => boolean,
  isEnvSatisfied: (envName: string) => boolean,
  isConfigSatisfied: (path: string) => boolean,
  eligibility?: HookEligibilityContext,
): HookStatusEntry {
  const hookKey = resolveHookKey(entry);
  const managedByPlugin = entry.hook.source === 'plugin';
  const always = entry.metadata?.always === true;
  const events = entry.metadata?.events ?? [];

  const { requirements, missing, requirementsSatisfied, configChecks } = evaluateRequirements(
    entry,
    hasLocalBin,
    isEnvSatisfied,
    isConfigSatisfied,
    eligibility,
  );

  const loadable = enabledByConfig && requirementsSatisfied;
  const finalBlockedReason =
    blockedReason ?? (requirementsSatisfied ? undefined : 'missing requirements');

  return {
    name: entry.hook.name,
    description: entry.hook.description,
    source: entry.hook.source,
    pluginId: entry.hook.pluginId,
    filePath: entry.hook.filePath,
    baseDir: entry.hook.baseDir,
    handlerPath: entry.hook.handlerPath,
    hookKey,
    emoji: entry.metadata?.emoji,
    homepage: entry.metadata?.homepage,
    events,
    always,
    enabledByConfig,
    requirementsSatisfied,
    loadable,
    blockedReason: finalBlockedReason,
    managedByPlugin,
    requirements,
    missing,
    configChecks,
    install: normalizeInstallOptions(entry),
  };
}

export type BuildHookStatusOptions = {
  entries: HookEntry[];
  config?: Record<string, unknown>;
  eligibility?: HookEligibilityContext;
  getHookConfig?: (config: Record<string, unknown> | undefined, hookKey: string) => HookConfig | undefined;
  isEnabled?: (entry: HookEntry, hookConfig: HookConfig | undefined, config: Record<string, unknown> | undefined) => {
    enabled: boolean;
    reason?: string;
  };
  hasBin?: (bin: string) => boolean;
};

export function buildHookStatusReport(
  workspaceDir: string,
  managedHooksDir: string,
  options: BuildHookStatusOptions,
): HookStatusReport {
  const {
    entries,
    config,
    eligibility,
    getHookConfig = () => undefined,
    isEnabled = (entry): { enabled: boolean; reason?: string } => ({ enabled: entry.hook.source === 'bundled' || entry.hook.source === 'plugin' }),
    hasBin = () => false,
  } = options;

  const isEnvSatisfied = (envName: string): boolean => {
    return Boolean(process.env[envName]);
  };

  const isConfigSatisfied = (pathStr: string): boolean => {
    if (!config) return false;
    const parts = pathStr.split('.');
    let current: unknown = config;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return false;
      }
    }
    return current !== undefined && current !== null && current !== false;
  };

  const hooks = entries.map((entry) => {
    const hookKey = resolveHookKey(entry);
    const hookConfig = getHookConfig(config, hookKey);
    const enableState = isEnabled(entry, hookConfig, config);
    return buildHookStatus(
      entry,
      hookConfig,
      enableState.enabled,
      enableState.reason,
      hasBin,
      isEnvSatisfied,
      isConfigSatisfied,
      eligibility,
    );
  });

  logger.debug(`[hooks:Status] Built status report for ${hooks.length} hooks`);

  return {
    workspaceDir,
    managedHooksDir,
    hooks,
  };
}

export function filterLoadableHooks(report: HookStatusReport): HookStatusEntry[] {
  return report.hooks.filter((h) => h.loadable);
}

export function filterHooksBySource(
  report: HookStatusReport,
  source: string,
): HookStatusEntry[] {
  return report.hooks.filter((h) => h.source === source);
}

export function getHookStatusByName(
  report: HookStatusReport,
  name: string,
): HookStatusEntry | undefined {
  return report.hooks.find((h) => h.name === name);
}

export function getHookStatusByKey(
  report: HookStatusReport,
  hookKey: string,
): HookStatusEntry | undefined {
  return report.hooks.find((h) => h.hookKey === hookKey);
}

export function summarizeHookStatus(report: HookStatusReport): {
  total: number;
  loadable: number;
  disabled: number;
  missingRequirements: number;
  bySource: Record<string, number>;
} {
  const bySource: Record<string, number> = {};
  let loadable = 0;
  let disabled = 0;
  let missingRequirements = 0;

  for (const hook of report.hooks) {
    bySource[hook.source] = (bySource[hook.source] ?? 0) + 1;
    if (hook.loadable) {
      loadable++;
    } else if (!hook.enabledByConfig) {
      disabled++;
    } else if (!hook.requirementsSatisfied) {
      missingRequirements++;
    }
  }

  return {
    total: report.hooks.length,
    loadable,
    disabled,
    missingRequirements,
    bySource,
  };
}
