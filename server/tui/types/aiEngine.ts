/**
 * TUI 使用的 AI 引擎类型定义
 *
 * 与前端的 src/contexts/AppSettingsContext.tsx 保持一致：
 * - ToolProfile: 工具集 Profile
 * - CompactionStrategy: 压缩策略
 */

export type ToolProfile = 'minimal' | 'coding' | 'messaging' | 'full';

export type CompactionStrategy = 'semantic' | 'extractive' | 'truncation';

export const TOOL_PROFILE_VALUES: ToolProfile[] = ['minimal', 'coding', 'messaging', 'full'];

export const COMPACTION_STRATEGY_VALUES: CompactionStrategy[] = ['semantic', 'extractive', 'truncation'];

export const TOOL_PROFILE_LABELS: Record<ToolProfile, { label: string; desc: string }> = {
  minimal: { label: '极简', desc: '仅核心工具，节省 token' },
  coding: { label: '编程', desc: '代码相关工具为主' },
  messaging: { label: '消息', desc: '消息和搜索类工具' },
  full: { label: '完整', desc: '所有可用工具' },
};

export const COMPACTION_STRATEGY_LABELS: Record<CompactionStrategy, { label: string; desc: string }> = {
  semantic: { label: '语义摘要', desc: 'AI 摘要，质量最高' },
  extractive: { label: '提取式', desc: '提取关键句，速度快' },
  truncation: { label: '截断', desc: '直接截断最早消息' },
};
