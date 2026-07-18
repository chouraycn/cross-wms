import { logger } from '../../logger.js';
import type { RuntimeConfig } from './server-runtime-config.js';
import { getRuntimeConfig, updateRuntimeConfig } from './server-runtime-config.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwnValue(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function mergeChannelActivationSections(params: {
  runtimeConfig: RuntimeConfig;
  activationConfig: Record<string, unknown>;
}): RuntimeConfig {
  const activationChannels = params.activationConfig.channels;
  if (!isRecord(activationChannels)) {
    return params.runtimeConfig;
  }

  const runtimeChannels = isRecord(params.runtimeConfig.extensions.channels)
    ? params.runtimeConfig.extensions.channels
    : {};

  let nextChannels: Record<string, unknown> | undefined;

  for (const [channelId, activationChannel] of Object.entries(activationChannels)) {
    if (!isRecord(activationChannel) || !hasOwnValue(activationChannel, 'enabled')) {
      continue;
    }
    const runtimeChannel = runtimeChannels[channelId];
    const runtimeChannelRecord = isRecord(runtimeChannel) ? runtimeChannel : {};
    nextChannels ??= { ...runtimeChannels };
    nextChannels[channelId] = {
      ...runtimeChannelRecord,
      enabled: (activationChannel as { enabled: unknown }).enabled,
    };
  }

  if (nextChannels === undefined) {
    return params.runtimeConfig;
  }

  return {
    ...params.runtimeConfig,
    extensions: {
      ...params.runtimeConfig.extensions,
      channels: nextChannels,
    },
  };
}

export function mergePluginActivationSections(params: {
  runtimeConfig: RuntimeConfig;
  activationConfig: Record<string, unknown>;
}): RuntimeConfig {
  const activationPlugins = params.activationConfig.plugins;
  if (!isRecord(activationPlugins)) {
    return params.runtimeConfig;
  }

  const runtimePlugins = isRecord(params.runtimeConfig.extensions.plugins)
    ? params.runtimeConfig.extensions.plugins
    : {};

  let nextPlugins: Record<string, unknown> | undefined;

  if (Array.isArray(activationPlugins.allow)) {
    nextPlugins = {
      ...runtimePlugins,
      allow: [...activationPlugins.allow],
    };
  }

  const activationEntries = activationPlugins.entries;
  if (isRecord(activationEntries)) {
    const runtimeEntries = isRecord(runtimePlugins.entries) ? runtimePlugins.entries : {};
    let nextEntries: Record<string, unknown> | undefined;

    for (const [pluginId, activationEntry] of Object.entries(activationEntries)) {
      if (!isRecord(activationEntry) || !hasOwnValue(activationEntry, 'enabled')) {
        continue;
      }
      const runtimeEntry = runtimeEntries[pluginId];
      const runtimeEntryRecord = isRecord(runtimeEntry) ? runtimeEntry : {};
      nextEntries ??= { ...runtimeEntries };
      nextEntries[pluginId] = {
        ...runtimeEntryRecord,
        enabled: (activationEntry as { enabled: unknown }).enabled,
      };
    }

    if (nextEntries !== undefined) {
      nextPlugins = {
        ...runtimePlugins,
        ...(nextPlugins ?? {}),
        entries: nextEntries,
      };
    }
  }

  if (nextPlugins === undefined) {
    return params.runtimeConfig;
  }

  return {
    ...params.runtimeConfig,
    extensions: {
      ...params.runtimeConfig.extensions,
      plugins: nextPlugins,
    },
  };
}

export function mergeActivationSectionsIntoRuntimeConfig(params: {
  runtimeConfig: RuntimeConfig;
  activationConfig: Record<string, unknown>;
}): RuntimeConfig {
  const withChannels = mergeChannelActivationSections(params);
  return mergePluginActivationSections({
    ...params,
    runtimeConfig: withChannels,
  });
}

export function applyActivationConfig(activationConfig: Record<string, unknown>): RuntimeConfig {
  const currentConfig = getRuntimeConfig();
  const mergedConfig = mergeActivationSectionsIntoRuntimeConfig({
    runtimeConfig: currentConfig,
    activationConfig,
  });

  updateRuntimeConfig('extensions', mergedConfig.extensions);

  logger.info('[Gateway] Activation config applied to runtime config');
  return getRuntimeConfig();
}

export function getPluginActivationFromConfig(pluginId: string): boolean | undefined {
  const config = getRuntimeConfig();
  const plugins = config.extensions.plugins;
  if (!isRecord(plugins) || !isRecord(plugins.entries)) {
    return undefined;
  }

  const entry = (plugins.entries as Record<string, unknown>)[pluginId];
  if (!isRecord(entry) || !hasOwnValue(entry, 'enabled')) {
    return undefined;
  }

  return entry.enabled as boolean;
}

export function setPluginActivationInConfig(pluginId: string, enabled: boolean): void {
  const config = getRuntimeConfig();
  const plugins = isRecord(config.extensions.plugins)
    ? { ...config.extensions.plugins }
    : {};

  const entries = isRecord(plugins.entries)
    ? { ...plugins.entries }
    : {};

  const currentEntry = isRecord(entries[pluginId])
    ? entries[pluginId]
    : {};

  entries[pluginId] = {
    ...currentEntry,
    enabled,
  };

  plugins.entries = entries;
  updateRuntimeConfig('extensions.plugins', plugins);

  logger.info(`[Gateway] Plugin activation set: ${pluginId} = ${enabled}`);
}
