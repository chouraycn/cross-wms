import { logger } from '../../logger.js';

export type ChannelPluginReloadTarget = {
  channelId: string;
  pluginId?: string | null;
  aliases?: readonly string[] | null;
};

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function addNormalizedTarget(targets: Set<string>, value: string | null | undefined): void {
  const normalized = normalizeOptionalString(value);
  if (normalized) {
    targets.add(normalized);
  }
}

export function listChannelPluginConfigTargetIds(
  target: ChannelPluginReloadTarget,
): ReadonlySet<string> {
  const targets = new Set<string>();
  addNormalizedTarget(targets, target.channelId);
  addNormalizedTarget(targets, target.pluginId);
  for (const alias of target.aliases ?? []) {
    addNormalizedTarget(targets, alias);
  }
  return targets;
}

export function pluginConfigTargetsChanged(
  targetIds: Iterable<string>,
  changedPaths: readonly string[],
): boolean {
  const prefixes = Array.from(targetIds, (id) => [
    `plugins.entries.${id}`,
    `plugins.installs.${id}`,
  ]).flat();

  return changedPaths.some((path) =>
    prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`)),
  );
}

export type PluginReloadTarget = {
  type: 'plugin' | 'channel' | 'all';
  pluginId?: string;
  channelId?: string;
};

const reloadTargets: PluginReloadTarget[] = [];

export function addPluginReloadTarget(target: PluginReloadTarget): void {
  reloadTargets.push(target);
  logger.debug(`[Gateway] Added plugin reload target: ${target.type}${target.pluginId ? ` - ${target.pluginId}` : ''}${target.channelId ? ` - ${target.channelId}` : ''}`);
}

export function clearPluginReloadTargets(): void {
  reloadTargets.length = 0;
}

export function getPluginReloadTargets(): readonly PluginReloadTarget[] {
  return [...reloadTargets];
}

export function hasPluginReloadTargets(): boolean {
  return reloadTargets.length > 0;
}

export function shouldReloadPlugin(pluginId: string): boolean {
  if (reloadTargets.some((t) => t.type === 'all')) {
    return true;
  }

  return reloadTargets.some((t) => t.type === 'plugin' && t.pluginId === pluginId);
}

export function shouldReloadChannel(channelId: string): boolean {
  if (reloadTargets.some((t) => t.type === 'all')) {
    return true;
  }

  return reloadTargets.some((t) => t.type === 'channel' && t.channelId === channelId);
}

export function markAllPluginsForReload(): void {
  addPluginReloadTarget({ type: 'all' });
}

export function markPluginForReload(pluginId: string): void {
  addPluginReloadTarget({ type: 'plugin', pluginId });
}

export function markChannelForReload(channelId: string): void {
  addPluginReloadTarget({ type: 'channel', channelId });
}
