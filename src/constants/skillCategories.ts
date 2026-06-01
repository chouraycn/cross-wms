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
};

/** 分类排序顺序 */
export const CATEGORY_ORDER = ['core', 'data', 'auto', 'tool'];

/** 分类配色（背景色 + 文字色） */
export const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  core: { bg: '#EFF6FF', color: '#2563EB' },
  data: { bg: '#FAF5FF', color: '#7C3AED' },
  auto: { bg: '#ECFDF5', color: '#059669' },
  tool: { bg: '#FFF7ED', color: '#EA580C' },
};

/** 技能图标区渐变色（卡片风格） */
export const ICON_GRADIENTS: Record<string, string> = {
  core: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
  data: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
  auto: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
  tool: 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)',
};
