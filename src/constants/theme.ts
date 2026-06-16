/**
 * CDF Know Clow 全局配色方案 - 极简黑白灰风格
 *
 * 所有组件应从该文件导入配色常量，避免重复定义
 */

// ===================== 基础灰阶 Token (Light Mode) =====================

/** 页面背景 */
export const BG_PAGE_LIGHT = '#F5F5F5';
/** 面板/卡片背景 */
export const BG_PANEL_LIGHT = '#FFFFFF';
/** 侧边栏背景 */
export const BG_SIDEBAR_LIGHT = '#F0F0F0';
/** 悬浮/悬停背景 */
export const BG_HOVER_LIGHT = '#F3F4F6';
/** 选中/激活背景 */
export const BG_ACTIVE_LIGHT = '#FFFFFF';
/** 输入框背景 */
export const BG_INPUT_LIGHT = '#FFFFFF';

/** 主文字 */
export const TEXT_PRIMARY_LIGHT = '#111827';
/** 次要文字 */
export const TEXT_SECONDARY_LIGHT = '#374151';
/** 辅助文字 */
export const TEXT_MUTED_LIGHT = '#6B7280';
/** 禁用/占位文字 */
export const TEXT_DISABLED_LIGHT = '#9CA3AF';

/** 主边框 */
export const BORDER_LIGHT = '#E5E7EB';
/** 浅边框 */
export const BORDER_LIGHTER = '#F3F4F6';
/** 深边框 */
export const BORDER_DARKER = '#D1D5DB';

// ===================== 基础灰阶 Token (Dark Mode) =====================

/** 页面背景 */
export const BG_PAGE_DARK = '#0F0F0F';
/** 面板/卡片背景 */
export const BG_PANEL_DARK = '#1A1A1A';
/** 侧边栏背景 */
export const BG_SIDEBAR_DARK = '#141414';
/** 悬浮/悬停背景 */
export const BG_HOVER_DARK = '#252525';
/** 选中/激活背景 */
export const BG_ACTIVE_DARK = '#2D2D2D';
/** 输入框背景 */
export const BG_INPUT_DARK = '#252525';

/** 主文字 */
export const TEXT_PRIMARY_DARK = '#F3F4F6';
/** 次要文字 */
export const TEXT_SECONDARY_DARK = '#E5E7EB';
/** 辅助文字 */
export const TEXT_MUTED_DARK = '#9CA3AF';
/** 禁用/占位文字 */
export const TEXT_DISABLED_DARK = '#6B7280';

/** 主边框 */
export const BORDER_DARK = '#2A2A2A';
/** 浅边框 */
export const BORDER_DARKER_DM = '#333333';
/** 深边框 */
export const BORDER_LIGHTER_DM = '#3D3D3D';

// ===================== 语义化颜色（不随主题变化） =====================

/** 成功 */
export const SUCCESS = '#10B981';
export const SUCCESS_BG = '#F0FDF4';
export const SUCCESS_BG_DARK = '#064E3B';

/** 错误 */
export const ERROR = '#EF4444';
export const ERROR_BG = '#FEE2E2';
export const ERROR_BG_DARK = '#7F1D1D';

/** 警告 */
export const WARNING = '#F59E0B';
export const WARNING_BG = '#FEF3C7';
export const WARNING_BG_DARK = '#78350F';

/** 信息 */
export const INFO = '#3B82F6';
export const INFO_BG = '#EFF6FF';
export const INFO_BG_DARK = '#1E3A8A';

// ===================== 语义化暗色模式颜色 =====================

/** 语义化状态色（暗色模式适配，符合 WCAG AA 4.5:1） */
export interface SemanticColors {
  success: string;
  successBg: string;
  successBorder: string;
  successText: string;
  error: string;
  errorBg: string;
  errorBorder: string;
  errorText: string;
  warning: string;
  warningBg: string;
  warningBorder: string;
  warningText: string;
  info: string;
  infoBg: string;
  infoBorder: string;
  infoText: string;
  /** 徽章背景色（深色，搭配白字对比度 >= 4.5:1） */
  badgeSuccess: string;
  badgeError: string;
  badgeWarning: string;
  badgeInfo: string;
}

/** 根据主题模式获取语义化颜色 */
export function getSemanticColors(isDark: boolean): SemanticColors {
  return isDark
    ? {
        success: '#34D399',
        successBg: '#064E3B',
        successBorder: '#059669',
        successText: '#A7F3D0',
        error: '#F87171',
        errorBg: '#7F1D1D',
        errorBorder: '#DC2626',
        errorText: '#FECACA',
        warning: '#FBBF24',
        warningBg: '#78350F',
        warningBorder: '#D97706',
        warningText: '#FDE68A',
        info: '#60A5FA',
        infoBg: '#1E3A8A',
        infoBorder: '#2563EB',
        infoText: '#BFDBFE',
        // 徽章背景色（深色，白字对比度 >= 4.5:1）
        badgeSuccess: '#047857',
        badgeError: '#B91C1C',
        badgeWarning: '#B45309',
        badgeInfo: '#1D4ED8',
      }
    : {
        success: '#10B981',
        successBg: '#F0FDF4',
        successBorder: '#BBF7D0',
        successText: '#166534',
        error: '#EF4444',
        errorBg: '#FEF2F2',
        errorBorder: '#FECACA',
        errorText: '#991B1B',
        info: '#3B82F6',
        infoBg: '#EFF6FF',
        infoBorder: '#BFDBFE',
        infoText: '#1E40AF',
        warning: '#F59E0B',
        warningBg: '#FFFBEB',
        warningBorder: '#FDE68A',
        warningText: '#92400E',
        // 徽章背景色（深色，白字对比度 >= 4.5:1）
        badgeSuccess: '#059669',
        badgeError: '#DC2626',
        badgeWarning: '#D97706',
        badgeInfo: '#2563EB',
      };
}

// ===================== 统一灰阶获取函数 =====================

export interface GrayScale {
  bgPage: string;
  bgPanel: string;
  bgSidebar: string;
  bgHover: string;
  bgActive: string;
  bgInput: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  border: string;
  borderLighter: string;
  borderDarker: string;
}

/** 根据主题模式获取统一灰阶 */
export function getGrayScale(isDark: boolean): GrayScale {
  return isDark
    ? {
        bgPage: BG_PAGE_DARK,
        bgPanel: BG_PANEL_DARK,
        bgSidebar: BG_SIDEBAR_DARK,
        bgHover: BG_HOVER_DARK,
        bgActive: BG_ACTIVE_DARK,
        bgInput: BG_INPUT_DARK,
        textPrimary: TEXT_PRIMARY_DARK,
        textSecondary: TEXT_SECONDARY_DARK,
        textMuted: TEXT_MUTED_DARK,
        textDisabled: TEXT_DISABLED_DARK,
        border: BORDER_DARK,
        borderLighter: BORDER_DARKER_DM,
        borderDarker: BORDER_LIGHTER_DM,
      }
    : {
        bgPage: BG_PAGE_LIGHT,
        bgPanel: BG_PANEL_LIGHT,
        bgSidebar: BG_SIDEBAR_LIGHT,
        bgHover: BG_HOVER_LIGHT,
        bgActive: BG_ACTIVE_LIGHT,
        bgInput: BG_INPUT_LIGHT,
        textPrimary: TEXT_PRIMARY_LIGHT,
        textSecondary: TEXT_SECONDARY_LIGHT,
        textMuted: TEXT_MUTED_LIGHT,
        textDisabled: TEXT_DISABLED_LIGHT,
        border: BORDER_LIGHT,
        borderLighter: BORDER_LIGHTER,
        borderDarker: BORDER_DARKER,
      };
}

// ===================== 兼容旧代码的常量（已废弃） =====================

/** @deprecated 使用 getGrayScale(isDark).textPrimary */
export const PRIMARY = '#111827';
/** @deprecated 使用 getGrayScale(isDark).textMuted */
export const SECONDARY = '#6B7280';
/** @deprecated 使用 getGrayScale(isDark).border */
export const BORDER = '#E5E7EB';
/** @deprecated 使用 getGrayScale(isDark).bgHover */
export const BG_LIGHT = '#F3F4F6';
/** @deprecated 使用 getGrayScale(isDark).bgPage */
export const BG_PAGE = '#FAFAFA';
/** @deprecated 使用 getGrayScale(isDark).bgPanel */
export const WHITE = '#FFFFFF';
/** @deprecated 使用 theme.shape.borderRadius */
export const RADIUS = 6;

/** @deprecated 新代码请使用 getGrayScale */
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
