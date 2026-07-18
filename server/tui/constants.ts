export const TOOL_PROFILE_VALUES = ['full', 'basic', 'code', 'research', 'creative'] as const;
export type ToolProfile = typeof TOOL_PROFILE_VALUES[number];

export const TOOL_PROFILE_LABELS: Record<ToolProfile, string> = {
  full: '完整工具集',
  basic: '基础工具',
  code: '代码工具',
  research: '研究工具',
  creative: '创意工具',
};

export const COMPACTION_STRATEGY_VALUES = ['off', 'summary', 'active', 'auto'] as const;
export type CompactionStrategy = typeof COMPACTION_STRATEGY_VALUES[number];

export const COMPACTION_STRATEGY_LABELS: Record<CompactionStrategy, string> = {
  off: '关闭',
  summary: '摘要模式',
  active: '主动压缩',
  auto: '自动',
};
