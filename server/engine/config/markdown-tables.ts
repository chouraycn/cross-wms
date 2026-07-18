// 移植自 openclaw/src/config/markdown-tables.ts
// 按 channel 和渲染模式规范化 markdown 表格配置。
//
// 降级说明：源文件依赖 ../channels/plugins/index.js 的 normalizeChannelId、
// ../channels/plugins/registry.js 的 listChannelPlugins、
// ../plugins/runtime.js 的 getActivePluginChannelRegistryVersion、
// ../routing/account-lookup.js 的 resolveAccountEntry、
// ../routing/session-key.js 的 normalizeAccountId。
// cross-wms 暂缺这些模块，此处降级为基于 cfg 的简单解析（不查插件注册表）。
import type { ResolveMarkdownTableModeParams } from './markdown-tables.types.js';
import type { MarkdownTableMode } from './types/base.js';

type MarkdownConfigEntry = {
  markdown?: {
    tables?: MarkdownTableMode;
  };
};

type MarkdownConfigSection = MarkdownConfigEntry & {
  accounts?: Record<string, MarkdownConfigEntry>;
};

/** 降级实现：规范化 channel id（小写去空白）。 */
function normalizeChannelId(channel: string | null | undefined): string | null {
  if (typeof channel !== 'string') {
    return null;
  }
  const trimmed = channel.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** 降级实现：规范化 account id（小写去空白）。 */
function normalizeAccountId(accountId: string | null | undefined): string {
  if (typeof accountId !== 'string') {
    return '';
  }
  return accountId.trim().toLowerCase();
}

/** 降级实现：从 accounts 映射解析匹配条目（精确键优先，再回退通配）。 */
function resolveAccountEntry(
  accounts: Record<string, MarkdownConfigEntry>,
  normalizedAccountId: string,
): MarkdownConfigEntry | undefined {
  if (normalizedAccountId && accounts[normalizedAccountId]) {
    return accounts[normalizedAccountId];
  }
  return accounts['*'];
}

const isMarkdownTableMode = (value: unknown): value is MarkdownTableMode =>
  value === 'off' || value === 'bullets' || value === 'code' || value === 'block';

function resolveMarkdownModeFromSection(
  section: MarkdownConfigSection | undefined,
  accountId?: string | null,
): MarkdownTableMode | undefined {
  if (!section) {
    return undefined;
  }
  const normalizedAccountId = normalizeAccountId(accountId);
  const accounts = section.accounts;
  if (accounts && typeof accounts === 'object') {
    const match = resolveAccountEntry(accounts, normalizedAccountId);
    const matchMode = match?.markdown?.tables;
    if (isMarkdownTableMode(matchMode)) {
      return matchMode;
    }
  }
  const sectionMode = section.markdown?.tables;
  return isMarkdownTableMode(sectionMode) ? sectionMode : undefined;
}

export type {
  ResolveMarkdownTableMode,
  ResolveMarkdownTableModeParams,
} from './markdown-tables.types.js';

export function resolveMarkdownTableMode(
  params: ResolveMarkdownTableModeParams,
): MarkdownTableMode {
  const channel = normalizeChannelId(params.channel);
  // 降级：无插件注册表，默认使用 "code"。
  const defaultMode: MarkdownTableMode = 'code';
  let resolved: MarkdownTableMode | undefined = defaultMode;
  if (channel && params.cfg) {
    const channelsConfig = params.cfg.channels as Record<string, unknown> | undefined;
    const rootConfig = params.cfg as Record<string, unknown>;
    const section = (channelsConfig?.[channel] ?? rootConfig[channel]) as
      | MarkdownConfigSection
      | undefined;
    resolved = resolveMarkdownModeFromSection(section, params.accountId) ?? defaultMode;
  }
  return resolved === 'block' && !params.supportsBlockTables ? 'code' : resolved;
}
