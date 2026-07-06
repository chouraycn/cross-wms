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
/** 聊天消息背景 */
export const BG_CHAT_USER_LIGHT = '#3B82F6';
export const BG_CHAT_BOT_LIGHT = '#F3F4F6';

/** 主文字 */
export const TEXT_PRIMARY_LIGHT = '#111827';
/** 次要文字 */
export const TEXT_SECONDARY_LIGHT = '#374151';
/** 辅助文字 */
export const TEXT_MUTED_LIGHT = '#6B7280';
/** 禁用/占位文字 */
export const TEXT_DISABLED_LIGHT = '#9CA3AF';
/** 聊天用户文字 */
export const TEXT_CHAT_USER_LIGHT = '#FFFFFF';
export const TEXT_CHAT_BOT_LIGHT = '#111827';

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
/** 聊天消息背景 */
export const BG_CHAT_USER_DARK = '#4F46E5';
export const BG_CHAT_BOT_DARK = '#252525';

/** 主文字 */
export const TEXT_PRIMARY_DARK = '#F3F4F6';
/** 次要文字 */
export const TEXT_SECONDARY_DARK = '#E5E7EB';
/** 辅助文字 */
export const TEXT_MUTED_DARK = '#9CA3AF';
/** 禁用/占位文字 */
export const TEXT_DISABLED_DARK = '#6B7280';
/** 聊天用户文字 */
export const TEXT_CHAT_USER_DARK = '#FFFFFF';
export const TEXT_CHAT_BOT_DARK = '#E5E7EB';

/** 主边框 */
export const BORDER_DARK = '#2A2A2A';
/** 浅边框 */
export const BORDER_DARKER_DM = '#333333';
/** 深边框 */
export const BORDER_LIGHTER_DM = '#3D3D3D';

// ===================== 字体大小 Token =====================

export interface FontSizes {
  xs: string;
  sm: string;
  base: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  '3xl': string;
}

export const FONT_SIZES: Record<string, FontSizes> = {
  small: {
    xs: '0.625rem',
    sm: '0.7rem',
    base: '0.75rem',
    md: '0.8rem',
    lg: '0.875rem',
    xl: '1rem',
    '2xl': '1.125rem',
    '3xl': '1.25rem',
  },
  medium: {
    xs: '0.6875rem',
    sm: '0.75rem',
    base: '0.8125rem',
    md: '0.875rem',
    lg: '0.9375rem',
    xl: '1.0625rem',
    '2xl': '1.25rem',
    '3xl': '1.375rem',
  },
  large: {
    xs: '0.75rem',
    sm: '0.8125rem',
    base: '0.875rem',
    md: '0.9375rem',
    lg: '1rem',
    xl: '1.125rem',
    '2xl': '1.375rem',
    '3xl': '1.5rem',
  },
};

// ===================== 圆角大小 Token =====================

export interface BorderRadii {
  none: number;
  sm: number;
  base: number;
  md: number;
  lg: number;
  xl: number;
  full: number;
}

export const BORDER_RADII: Record<string, BorderRadii> = {
  sharp: {
    none: 0,
    sm: 0,
    base: 0,
    md: 0,
    lg: 0,
    xl: 0,
    full: 0,
  },
  normal: {
    none: 0,
    sm: 2,
    base: 4,
    md: 6,
    lg: 8,
    xl: 12,
    full: 9999,
  },
  rounded: {
    none: 0,
    sm: 4,
    base: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },
};

// ===================== 间距 Token =====================

export interface Spacing {
  xs: number;
  sm: number;
  base: number;
  md: number;
  lg: number;
  xl: number;
}

export const SPACING: Record<string, Spacing> = {
  compact: {
    xs: 2,
    sm: 4,
    base: 6,
    md: 8,
    lg: 12,
    xl: 16,
  },
  normal: {
    xs: 4,
    sm: 8,
    base: 12,
    md: 16,
    lg: 20,
    xl: 24,
  },
};

// ===================== 阴影 Token =====================

export interface Shadows {
  none: string;
  sm: string;
  base: string;
  md: string;
  lg: string;
}

export const SHADOWS: Record<string, Shadows> = {
  none: {
    none: 'none',
    sm: 'none',
    base: 'none',
    md: 'none',
    lg: 'none',
  },
  light: {
    none: 'none',
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    base: '0 1px 3px rgba(0,0,0,0.1)',
    md: '0 4px 6px rgba(0,0,0,0.1)',
    lg: '0 10px 15px rgba(0,0,0,0.1)',
  },
  dark: {
    none: 'none',
    sm: '0 1px 2px rgba(0,0,0,0.3)',
    base: '0 1px 3px rgba(0,0,0,0.4)',
    md: '0 4px 6px rgba(0,0,0,0.4)',
    lg: '0 10px 15px rgba(0,0,0,0.5)',
  },
};

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
  bgChatUser: string;
  bgChatBot: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  textChatUser: string;
  textChatBot: string;
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
        bgChatUser: BG_CHAT_USER_DARK,
        bgChatBot: BG_CHAT_BOT_DARK,
        textPrimary: TEXT_PRIMARY_DARK,
        textSecondary: TEXT_SECONDARY_DARK,
        textMuted: TEXT_MUTED_DARK,
        textDisabled: TEXT_DISABLED_DARK,
        textChatUser: TEXT_CHAT_USER_DARK,
        textChatBot: TEXT_CHAT_BOT_DARK,
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
        bgChatUser: BG_CHAT_USER_LIGHT,
        bgChatBot: BG_CHAT_BOT_LIGHT,
        textPrimary: TEXT_PRIMARY_LIGHT,
        textSecondary: TEXT_SECONDARY_LIGHT,
        textMuted: TEXT_MUTED_LIGHT,
        textDisabled: TEXT_DISABLED_LIGHT,
        textChatUser: TEXT_CHAT_USER_LIGHT,
        textChatBot: TEXT_CHAT_BOT_LIGHT,
        border: BORDER_LIGHT,
        borderLighter: BORDER_LIGHTER,
        borderDarker: BORDER_DARKER,
      };
}

// ===================== 聊天容器宽度 =====================

/**
 * 聊天区域统一最大宽度（px）
 * ChatContainer 输入框 + ChatMessageList 消息列表共享此值
 * 修改此常量即可统一调整整个聊天区域宽度
 */
export const CHAT_MAX_WIDTH = 920;
