/**
 * Bundled channel bootstrap registry.
 *
 * Provides channel plugin metadata before the full runtime registry is installed.
 */
import { normalizeOptionalString } from "../../infra/string-coerce.js";
import { listBundledChannelPluginIdsForRoot } from "../bundled-ids.js";
import { resolveBundledChannelRootScope } from "../bundled-root.js";
import {
  getBundledChannelPlugin,
  getBundledChannelSecrets,
  getBundledChannelSetupPlugin,
  getBundledChannelSetupSecrets,
} from "../bundled.js";
import type { ChannelPlugin } from "../types.public.js";
import type { ChannelId } from "../types.public.js";

function resolveBootstrapChannelId(id: ChannelId): string {
  return normalizeOptionalString(id) ?? "";
}

function mergePluginSection<T>(
  runtimeValue: T | undefined,
  setupValue: T | undefined,
): T | undefined {
  if (
    runtimeValue &&
    setupValue &&
    typeof runtimeValue === "object" &&
    typeof setupValue === "object"
  ) {
    // Setup artifacts can add lightweight setup/docs/secrets fields on top of
    // runtime artifacts; undefined setup values should not erase runtime data.
    const merged = {
      ...(runtimeValue as Record<string, unknown>),
    };
    for (const [key, value] of Object.entries(setupValue as Record<string, unknown>)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }
    return {
      ...merged,
    } as T;
  }
  return setupValue ?? runtimeValue;
}

function mergeBootstrapPlugin(
  runtimePlugin: ChannelPlugin,
  setupPlugin: ChannelPlugin,
): ChannelPlugin {
  return {
    ...runtimePlugin,
    ...setupPlugin,
    meta: mergePluginSection(runtimePlugin.meta, setupPlugin.meta),
    capabilities: mergePluginSection(runtimePlugin.capabilities, setupPlugin.capabilities),
    commands: mergePluginSection(runtimePlugin.commands, setupPlugin.commands),
    doctor: mergePluginSection(runtimePlugin.doctor, setupPlugin.doctor),
    reload: mergePluginSection(runtimePlugin.reload, setupPlugin.reload),
    config: mergePluginSection(runtimePlugin.config, setupPlugin.config),
    setup: mergePluginSection(runtimePlugin.setup, setupPlugin.setup),
    messaging: mergePluginSection(runtimePlugin.messaging, setupPlugin.messaging),
    actions: mergePluginSection(runtimePlugin.actions, setupPlugin.actions),
    secrets: mergePluginSection(runtimePlugin.secrets, setupPlugin.secrets),
  } as ChannelPlugin;
}

/**
 * Lists bundled channel ids visible to bootstrap for the current root scope.
 */
export function listBootstrapChannelPluginIds(): readonly string[] {
  const rootScope = resolveBundledChannelRootScope() as { cacheKey?: string } | undefined;
  const cacheKey = rootScope?.cacheKey;
  if (typeof cacheKey !== "string") {
    return [];
  }
  return (listBundledChannelPluginIdsForRoot(cacheKey) as readonly string[]) ?? [];
}

/**
 * Loads a bundled channel plugin for bootstrap, merging runtime and setup artifacts.
 */
export function getBootstrapChannelPlugin(id: ChannelId): ChannelPlugin | undefined {
  const resolvedId = resolveBootstrapChannelId(id);
  if (!resolvedId) {
    return undefined;
  }
  let runtimePlugin: ChannelPlugin | undefined;
  let setupPlugin: ChannelPlugin | undefined;
  try {
    runtimePlugin = getBundledChannelPlugin(resolvedId) as ChannelPlugin | undefined;
    setupPlugin = getBundledChannelSetupPlugin(resolvedId) as ChannelPlugin | undefined;
  } catch {
    // Bootstrap discovery treats broken/missing bundled channel artifacts as
    // absent so install/doctor flows can continue scanning other channels.
    return undefined;
  }
  const merged =
    runtimePlugin && setupPlugin
      ? mergeBootstrapPlugin(runtimePlugin, setupPlugin)
      : (setupPlugin ?? runtimePlugin);
  return merged;
}

/**
 * Loads bootstrap secret metadata from bundled runtime and setup artifacts.
 */
export type BootstrapChannelSecrets = {
  collectRuntimeConfigAssignments?: (params: unknown) => void;
  [key: string]: unknown;
};

export function getBootstrapChannelSecrets(
  id: ChannelId,
): BootstrapChannelSecrets | undefined {
  const resolvedId = resolveBootstrapChannelId(id);
  if (!resolvedId) {
    return undefined;
  }
  try {
    const runtimeSecrets = getBundledChannelSecrets(resolvedId) as
      | BootstrapChannelSecrets
      | undefined;
    const setupSecrets = getBundledChannelSetupSecrets(resolvedId) as
      | BootstrapChannelSecrets
      | undefined;
    return mergePluginSection(runtimeSecrets, setupSecrets);
  } catch {
    return undefined;
  }
}
