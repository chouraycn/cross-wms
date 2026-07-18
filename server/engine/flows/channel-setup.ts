/**
 * 渠道设置流程 — 参考 openclaw/src/flows/channel-setup.ts
 *
 * 构建渠道配置选项，基于已注册的渠道插件。
 * 不依赖 @openclaw/* 包，使用项目内部 channels 注册表。
 */

import type { FlowContribution, FlowOption } from './types.js';
import { sortFlowContributionsByLabel } from './types.js';
import {
  listAllRegisteredChannelPlugins,
  listEnabledChannelPlugins,
} from '../../channels/lookup.js';
import type { ChannelPlugin } from '../../channels/plugin.js';
import type { AppConfig } from '../../channels/types.js';

// ===================== 类型定义 =====================

/** 渠道设置选项，附带渠道元数据。 */
export type ChannelSetupOption = FlowOption & {
  channelId: string;
  configured: boolean;
  enabled: boolean;
  markdownCapable?: boolean;
};

/** 渠道设置贡献，对应 setup 表面。 */
export type ChannelSetupContribution = FlowContribution & {
  kind: 'channel';
  surface: 'setup';
  channelId: string;
  plugin: ChannelPlugin;
  option: ChannelSetupOption;
  source: 'registry';
};

/** buildChannelSetupOptions 的可选参数。 */
export interface BuildChannelSetupOptionsParams {
  /** 应用配置，用于判定渠道启用/配置状态；未提供时仅展示注册表元数据。 */
  config?: AppConfig;
  /** 仅展示已启用的渠道。 */
  enabledOnly?: boolean;
  /** 仅展示已配置的渠道。 */
  configuredOnly?: boolean;
}

// ===================== 选项构建 =====================

/**
 * 构建渠道配置选项列表。
 *
 * 从渠道注册表收集所有已注册插件，按 label 排序。
 * enabledOnly/configuredOnly 可进一步过滤展示范围。
 */
export function buildChannelSetupOptions(
  params: BuildChannelSetupOptionsParams = {},
): ChannelSetupOption[] {
  const contributions = buildChannelSetupContributions(params);
  return contributions.map((contribution) => contribution.option);
}

/** 构建渠道设置贡献列表（含原始插件引用）。 */
export function buildChannelSetupContributions(
  params: BuildChannelSetupOptionsParams = {},
): ChannelSetupContribution[] {
  const plugins = params.config
    ? listEnabledChannelPlugins(params.config)
    : listAllRegisteredChannelPlugins();
  const contributions = plugins
    .filter((plugin) => {
      if (params.enabledOnly && !isChannelEnabled(plugin, params.config)) {
        return false;
      }
      if (params.configuredOnly && !isChannelConfigured(plugin, params.config)) {
        return false;
      }
      return true;
    })
    .map((plugin) => buildChannelSetupContribution(plugin, params.config));
  return sortFlowContributionsByLabel(contributions);
}

/** 将单个渠道插件转换为设置贡献。 */
function buildChannelSetupContribution(
  plugin: ChannelPlugin,
  config: AppConfig | undefined,
): ChannelSetupContribution {
  const meta = plugin.meta;
  const enabled = isChannelEnabled(plugin, config);
  const configured = isChannelConfigured(plugin, config);
  const hints: string[] = [];
  if (meta.blurb) {
    hints.push(meta.blurb);
  }
  if (configured) {
    hints.push('已配置');
  } else if (enabled) {
    hints.push('已启用');
  } else {
    hints.push('未配置');
  }
  return {
    id: `channel:setup:${plugin.id}`,
    kind: 'channel',
    surface: 'setup',
    channelId: plugin.id,
    plugin,
    source: 'registry',
    option: {
      value: plugin.id,
      label: meta.selectionLabel ?? meta.label,
      hint: hints.length > 0 ? hints.join(' · ') : undefined,
      channelId: plugin.id,
      configured,
      enabled,
      ...(meta.markdownCapable !== undefined ? { markdownCapable: meta.markdownCapable } : {}),
      ...(meta.docsPath ? { docs: { path: meta.docsPath } } : {}),
    },
  };
}

// ===================== 状态判定 =====================

/**
 * 判断渠道是否已启用。
 *
 * 优先使用 plugin.config.isEnabled；若 config 未提供则视为未启用。
 */
export function isChannelEnabled(plugin: ChannelPlugin, config: AppConfig | undefined): boolean {
  if (!config) {
    return false;
  }
  if (plugin.config.isEnabled) {
    const accountIds = plugin.config.listAccountIds(config);
    const accountId = accountIds[0];
    if (accountId === undefined) {
      return false;
    }
    const account = plugin.config.resolveAccount(config, accountId);
    if (account === null) {
      return false;
    }
    return plugin.config.isEnabled(account, config);
  }
  return false;
}

/**
 * 判断渠道是否已配置（至少存在一个账户）。
 */
export function isChannelConfigured(
  plugin: ChannelPlugin,
  config: AppConfig | undefined,
): boolean {
  if (!config || !plugin.config.listAccountIds) {
    return false;
  }
  return plugin.config.listAccountIds(config).length > 0;
}

// ===================== 状态汇总 =====================

/** 渠道设置状态汇总。 */
export interface ChannelSetupStatusSummary {
  readonly total: number;
  readonly enabled: number;
  readonly configured: number;
  readonly unconfigured: number;
}

/**
 * 汇总渠道设置状态。
 */
export function summarizeChannelSetupStatus(
  params: BuildChannelSetupOptionsParams = {},
): ChannelSetupStatusSummary {
  const options = buildChannelSetupOptions(params);
  const enabled = options.filter((o) => o.enabled).length;
  const configured = options.filter((o) => o.configured).length;
  return {
    total: options.length,
    enabled,
    configured,
    unconfigured: options.length - configured,
  };
}

/**
 * 按分类分组渠道选项。
 *
 * 默认按 plugin 的 category 分组，未分类的归入 "other"。
 */
export function groupChannelOptionsByCategory(
  options: readonly ChannelSetupOption[],
): Record<string, ChannelSetupOption[]> {
  const groups: Record<string, ChannelSetupOption[]> = {};
  for (const option of options) {
    const category = 'other';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(option);
  }
  return groups;
}

/**
 * 检查指定 channelId 是否已配置。
 *
 * 渠道不存在时返回 false。
 */
export function isChannelConfiguredById(
  channelId: string,
  params: BuildChannelSetupOptionsParams = {},
): boolean {
  const options = buildChannelSetupOptions(params);
  const found = options.find((o) => o.channelId === channelId);
  return found?.configured ?? false;
}
