/**
 * CLI 选择界面 — 命令行模型选择交互
 *
 * 提供 CLI 环境下的模型选择、列表显示、
 * 搜索过滤等交互功能。
 */

import { logger } from '../../logger.js';
import {
  buildDisplayGroups,
  searchDisplayModels,
  formatContextWindow,
  getProviderDisplayName,
  type ModelDisplayInfo,
  type DisplayGroup,
} from './model-selection-display.js';

export interface CliModelPickerOptions {
  title?: string;
  showProvider?: boolean;
  showCapabilities?: boolean;
  showContextWindow?: boolean;
  showAuthStatus?: boolean;
  filterByAuth?: 'all' | 'authenticated' | 'unauthenticated';
  groupBy?: 'provider' | 'category' | 'none';
  maxDisplayItems?: number;
}

export interface CliModelPickerResult {
  selectedModelId: string;
  selectedProvider: string;
  displayName: string;
}

export interface CliModelListOptions {
  format?: 'table' | 'list' | 'json';
  groupBy?: 'provider' | 'category' | 'none';
  filter?: string;
  showAll?: boolean;
}

const DEFAULT_OPTIONS: CliModelPickerOptions = {
  title: '选择模型',
  showProvider: true,
  showCapabilities: true,
  showContextWindow: true,
  showAuthStatus: true,
  filterByAuth: 'all',
  groupBy: 'category',
  maxDisplayItems: 50,
};

export function formatModelListForCli(
  models: Array<{
    id: string;
    name: string;
    provider: string;
    description?: string;
    capabilities?: string[];
    contextWindow?: number;
    isRecommended?: boolean;
    authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
  }>,
  options: CliModelListOptions = {},
): string {
  const format = options.format ?? 'table';

  const filteredModels = options.filter
    ? models.filter(m =>
        m.name.toLowerCase().includes(options.filter!.toLowerCase()) ||
        m.id.toLowerCase().includes(options.filter!.toLowerCase()) ||
        m.provider.toLowerCase().includes(options.filter!.toLowerCase()),
      )
    : models;

  if (format === 'json') {
    return JSON.stringify(filteredModels, null, 2);
  }

  if (format === 'list') {
    return formatAsList(filteredModels);
  }

  return formatAsTable(filteredModels, options);
}

function formatAsTable(
  models: Array<{
    id: string;
    name: string;
    provider: string;
    contextWindow?: number;
    authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
    isRecommended?: boolean;
  }>,
  _options: CliModelListOptions,
): string {
  if (models.length === 0) {
    return '没有找到匹配的模型';
  }

  const header = [
    '模型',
    '提供商',
    '上下文',
    '状态',
  ];

  const rows = models.map(m => [
    m.isRecommended ? `⭐ ${m.name}` : m.name,
    getProviderDisplayName(m.provider),
    formatContextWindow(m.contextWindow),
    formatAuthStatus(m.authStatus ?? 'pending'),
  ]);

  const colWidths = [
    Math.max(header[0].length, ...rows.map(r => r[0].length)),
    Math.max(header[1].length, ...rows.map(r => r[1].length)),
    Math.max(header[2].length, ...rows.map(r => r[2].length)),
    Math.max(header[3].length, ...rows.map(r => r[3].length)),
  ];

  const separator = colWidths.map(w => '─'.repeat(w + 2)).join('┼');

  const lines: string[] = [];
  lines.push(formatRow(header, colWidths));
  lines.push(separator);
  lines.push(...rows.map(r => formatRow(r, colWidths)));

  lines.push('');
  lines.push(`共 ${models.length} 个模型`);

  return lines.join('\n');
}

function formatRow(cells: string[], widths: number[]): string {
  return cells.map((cell, i) => ` ${cell.padEnd(widths[i])} `).join('│');
}

function formatAsList(
  models: Array<{
    id: string;
    name: string;
    provider: string;
    description?: string;
    capabilities?: string[];
    contextWindow?: number;
    authStatus?: 'authenticated' | 'unauthenticated' | 'pending';
    isRecommended?: boolean;
  }>,
): string {
  if (models.length === 0) {
    return '没有找到匹配的模型';
  }

  const lines: string[] = [];

  for (const model of models) {
    const prefix = model.isRecommended ? '⭐ ' : '  ';
    lines.push(`${prefix}${model.name}`);
    lines.push(`   ID: ${model.id}`);
    lines.push(`   提供商: ${getProviderDisplayName(model.provider)}`);
    if (model.contextWindow) {
      lines.push(`   上下文: ${formatContextWindow(model.contextWindow)}`);
    }
    lines.push(`   状态: ${formatAuthStatus(model.authStatus ?? 'pending')}`);
    if (model.description) {
      lines.push(`   描述: ${model.description}`);
    }
    if (model.capabilities && model.capabilities.length > 0) {
      lines.push(`   能力: ${model.capabilities.join(', ')}`);
    }
    lines.push('');
  }

  lines.push(`共 ${models.length} 个模型`);
  return lines.join('\n');
}

function formatAuthStatus(status: 'authenticated' | 'unauthenticated' | 'pending'): string {
  switch (status) {
    case 'authenticated':
      return '✓ 已认证';
    case 'unauthenticated':
      return '✗ 未认证';
    case 'pending':
      return '? 待检测';
  }
}

export function createModelPickerPrompt(
  models: ModelDisplayInfo[],
  options: CliModelPickerOptions = {},
): {
  title: string;
  items: Array<{
    value: string;
    label: string;
    hint?: string;
  }>;
} {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const displayModels = opts.filterByAuth === 'all'
    ? models
    : models.filter(m =>
        opts.filterByAuth === 'authenticated'
          ? m.authStatus === 'authenticated'
          : m.authStatus !== 'authenticated',
      );

  const items = displayModels.slice(0, opts.maxDisplayItems).map(m => ({
    value: m.id,
    label: buildPickerLabel(m, opts),
    hint: m.description,
  }));

  return {
    title: opts.title ?? '选择模型',
    items,
  };
}

function buildPickerLabel(
  model: ModelDisplayInfo,
  options: CliModelPickerOptions,
): string {
  const parts: string[] = [];

  if (model.isRecommended) {
    parts.push('⭐');
  }

  parts.push(model.name);

  if (options.showProvider) {
    parts.push(`[${model.providerName}]`);
  }

  if (options.showContextWindow && model.contextWindow) {
    parts.push(`(${formatContextWindow(model.contextWindow)})`);
  }

  if (options.showAuthStatus) {
    parts.push(formatAuthStatusShort(model.authStatus));
  }

  return parts.join(' ');
}

function formatAuthStatusShort(status: 'authenticated' | 'unauthenticated' | 'pending'): string {
  switch (status) {
    case 'authenticated':
      return '✓';
    case 'unauthenticated':
      return '✗';
    case 'pending':
      return '?';
  }
}

export function groupModelsForCliDisplay(
  models: ModelDisplayInfo[],
  options: CliModelPickerOptions = {},
): DisplayGroup[] {
  return buildDisplayGroups(models, {
    groupBy: options.groupBy ?? 'category',
    showUnauthenticated: options.filterByAuth !== 'authenticated',
  });
}

export function isCliProvider(providerId: string): boolean {
  return Boolean(providerId && providerId.trim().length > 0);
}
