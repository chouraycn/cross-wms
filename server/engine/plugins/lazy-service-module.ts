// Lazily resolves optional service modules without eager runtime imports.
//
// 移植自 openclaw/src/plugins/lazy-service-module.ts。
//
// 降级策略：
//  - 原文件依赖 ../infra/env.js 的 isTruthyEnvValue。cross-wms 的 infra/env.js
//    已提供同名导出，直接复用。
//  - 原文件依赖 ../shared/import-specifier.js 的 toSafeImportPath。cross-wms 的
//    shared/import-specifier.js 已提供同名导出，直接复用。
//  - 行为与 openclaw 原版一致：按 env 开关与 override 决定加载哪个模块。

import { isTruthyEnvValue } from "../infra/env.js";
import { toSafeImportPath } from "../shared/import-specifier.js";

type LazyServiceModule = Record<string, unknown>;

export type LazyPluginServiceHandle = {
  stop: () => Promise<void>;
};

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Dynamic service exports are typed by the caller.
function resolveExport<T>(mod: LazyServiceModule, names: string[]): T | null {
  for (const name of names) {
    const value = mod[name];
    if (typeof value === "function") {
      return value as T;
    }
  }
  return null;
}

export async function defaultLoadOverrideModule(
  specifier: string,
  importModule: (specifier: string) => Promise<LazyServiceModule> = async (source: string) =>
    await import(source),
): Promise<LazyServiceModule> {
  return importModule(toSafeImportPath(specifier));
}

export async function startLazyPluginServiceModule(params: {
  skipEnvVar?: string;
  overrideEnvVar?: string;
  validateOverrideSpecifier?: (specifier: string) => string;
  loadDefaultModule: () => Promise<LazyServiceModule>;
  loadOverrideModule?: (specifier: string) => Promise<LazyServiceModule>;
  startExportNames: string[];
  stopExportNames?: string[];
}): Promise<LazyPluginServiceHandle | null> {
  const skipEnvVar = params.skipEnvVar?.trim();
  if (skipEnvVar && isTruthyEnvValue(process.env[skipEnvVar])) {
    return null;
  }

  const overrideEnvVar = params.overrideEnvVar?.trim();
  const override = overrideEnvVar ? process.env[overrideEnvVar]?.trim() : undefined;
  const loadOverrideModule = params.loadOverrideModule ?? defaultLoadOverrideModule;
  const validatedOverride =
    override && params.validateOverrideSpecifier
      ? params.validateOverrideSpecifier(override)
      : override;
  const mod = validatedOverride
    ? await loadOverrideModule(validatedOverride)
    : await params.loadDefaultModule();
  const start = resolveExport<() => Promise<unknown>>(mod, params.startExportNames);
  if (!start) {
    return null;
  }
  const stop =
    params.stopExportNames && params.stopExportNames.length > 0
      ? resolveExport<() => Promise<void>>(mod, params.stopExportNames)
      : null;

  await start();
  return {
    stop: stop ?? (async () => {}),
  };
}
