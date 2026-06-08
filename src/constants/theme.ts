/**
 * CDF Know Clow 全局配色方案 - 极简黑白灰风格
 *
 * 所有组件应从该文件导入配色常量，避免重复定义
 */

/** 主色（文字/标题）*/
export const PRIMARY = '#111827';

/** 次要色（辅助文字）*/
export const SECONDARY = '#6B7280';

/** 边框/分割线 */
export const BORDER = '#E5E7EB';

/** 背景浅灰（面板背景）*/
export const BG_LIGHT = '#F3F4F6';

/** 背景极浅（页面背景）*/
export const BG_PAGE = '#FAFAFA';

/** 纯白（卡片/输入框背景）*/
export const WHITE = '#FFFFFF';

/** 圆角统一（按钮、输入框、卡片）*/
export const RADIUS = 6;

/** 
 * 极简黑白灰配色常量（兼容旧代码）
 * @deprecated 新代码请直接使用上述常量
 */
export const CHAT_COLORS = {
  inputBg: BG_LIGHT,
  inputBorder: BORDER,
  chipBg: PRIMARY,
  chipText: '#fff',
  panelBg: WHITE,
  panelBorder: BORDER,
  textPrimary: PRIMARY,
  textSecondary: SECONDARY,
  hoverBg: '#F9FAFB',
} as const;
