/**
 * 技能分类统一常量
 *
 * 所有组件应从该文件导入分类相关常量，避免重复定义
 */

/** 分类中文标签 */
export const CATEGORY_LABELS: Record<string, string> = {
  core: '核心功能',
  data: '数据管理',
  auto: '自动化',
  tool: '工具',
  communication: '通讯协作',
  document: '文档处理',
  design: '设计创作',
  development: '开发工具',
  media: '媒体处理',
  finance: '财务分析',
  productivity: '效率提升',
  'ai-agent': 'AI 智能体',
  audit: '安全审计',
  '审计': '安全审计',
};

/** 分类排序顺序 */
export const CATEGORY_ORDER = [
  'core',
  'data',
  'auto',
  'tool',
  'communication',
  'document',
  'design',
  'development',
  'media',
  'finance',
  'productivity',
  'ai-agent',
  'audit',
];

/** 分类配色（背景色 + 文字色） */
export const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  core: { bg: '#EFF6FF', color: '#2563EB' },
  data: { bg: '#FAF5FF', color: '#7C3AED' },
  auto: { bg: '#ECFDF5', color: '#059669' },
  tool: { bg: '#FFF7ED', color: '#EA580C' },
  communication: { bg: '#F0F9FF', color: '#0284C7' },
  document: { bg: '#FEFCE8', color: '#CA8A04' },
  design: { bg: '#FDF2F8', color: '#DB2777' },
  development: { bg: '#F5F3FF', color: '#7C3AED' },
  media: { bg: '#ECFDF5', color: '#059669' },
  finance: { bg: '#FFF7ED', color: '#EA580C' },
  productivity: { bg: '#EFF6FF', color: '#2563EB' },
  'ai-agent': { bg: '#FAF5FF', color: '#7C3AED' },
  audit: { bg: '#ECFDF5', color: '#16A34A' },
  '审计': { bg: '#ECFDF5', color: '#16A34A' },
};

/** 技能图标区渐变色（卡片风格） */
export const ICON_GRADIENTS: Record<string, string> = {
  core: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
  data: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
  auto: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
  tool: 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)',
  communication: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
  document: 'linear-gradient(135deg, #CA8A04 0%, #A16207 100%)',
  design: 'linear-gradient(135deg, #DB2777 0%, #BE185D 100%)',
  development: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
  media: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
  finance: 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)',
  productivity: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
  'ai-agent': 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
  audit: 'linear-gradient(135deg, #16A34A 0%, #059669 100%)',
  '审计': 'linear-gradient(135deg, #16A34A 0%, #059669 100%)',
};

/** 安全获取分类 label（未知分类返回原值或 "其他"） */
export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category || '其他';
}

/** 安全获取分类颜色（未知分类返回兜底灰色调） */
export function getCategoryColors(category: string): { bg: string; color: string } {
  return CATEGORY_COLORS[category] || { bg: '#F3F4F6', color: '#6B7280' };
}

/** 安全获取分类图标渐变（未知分类返回兜底渐变） */
export function getCategoryGradient(category: string): string {
  return ICON_GRADIENTS[category] || 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)';
}

// ===================== 安全等级常量 =====================

/** 安全等级标签 */
export const AUDIT_LEVEL_LABELS: Record<string, string> = {
  safe: '安全',
  suspicious: '可疑',
  malicious: '恶意',
};

/** 安全等级颜色（文字色） */
export const AUDIT_LEVEL_COLORS: Record<string, string> = {
  safe: '#16A34A',
  suspicious: '#EA580C',
  malicious: '#DC2626',
};

/** 安全等级背景色 */
export const AUDIT_LEVEL_BG: Record<string, string> = {
  safe: '#DCFCE7',
  suspicious: '#FEF3C7',
  malicious: '#FEE2E2',
};
