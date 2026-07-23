// 移植自 openclaw/src/plugins/runtime/load-context.ts
// 降级策略：依赖项未移植，提供最小桩实现
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { PluginLoadOptions } from "../loader.js";
import type { PluginLogger } from "../types.js";

export type PluginRuntimeLoadContext = {
  rawConfig: OpenClawConfig;
  config: OpenClawConfig;
  activationSourceConfig: OpenClawConfig;
  autoEnabledReasons: Readonly<Record<string, string[]>>;
  workspaceDir: string | undefined;
  env: NodeJS.ProcessEnv;
  logger: PluginLogger;
};

export type PluginRuntimeResolvedLoadValues = Pick<
  PluginLoadOptions,
  "config" | "activationSourceConfig" | "autoEnabledReasons" | "workspaceDir" | "env" | "logger"
>;

export type PluginRuntimeLoadContextOptions = {
  config?: OpenClawConfig;
  activationSourceConfig?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
  logger?: PluginLogger;
};

export function createPluginRuntimeLoaderLogger(): PluginLogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

export function resolvePluginRuntimeLoadContext(
  options?: PluginRuntimeLoadContextOptions,
): PluginRuntimeLoadContext {
  const env = options?.env ?? process.env;
  const config = (options?.config ?? {}) as OpenClawConfig;
  return {
    rawConfig: config,
    config,
    activationSourceConfig: (options?.activationSourceConfig ?? config) as OpenClawConfig,
    autoEnabledReasons: {},
    workspaceDir: options?.workspaceDir,
    env,
    logger: options?.logger ?? createPluginRuntimeLoaderLogger(),
  };
}

export function buildPluginRuntimeLoadOptions(
  context: PluginRuntimeLoadContext,
  overrides?: Partial<PluginLoadOptions>,
): PluginLoadOptions {
  return {
    config: context.config,
    activationSourceConfig: context.activationSourceConfig,
    autoEnabledReasons: context.autoEnabledReasons,
    workspaceDir: context.workspaceDir,
    env: context.env,
    logger: context.logger,
    ...overrides,
  };
}
