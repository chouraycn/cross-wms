/**
 * ModelManager 共享样式 - 使用统一灰阶 Token
 */
import { getGrayScale } from '../../../constants/theme';

/** 获取模型管理器样式（需传入主题模式） */
export function getModelManagerStyles(isDark: boolean) {
  const gs = getGrayScale(isDark);

  return {
    // 容器
    container: {
      p: 3,
      backgroundColor: gs.bgPage,
      minHeight: '100vh',
    },

    // 标题
    title: {
      fontSize: '1.25rem',
      fontWeight: 600,
      color: gs.textPrimary,
      mb: 2,
    },

    // 工具栏按钮
    toolbarButton: {
      textTransform: 'none' as const,
      borderRadius: '6px',
      fontSize: '0.8125rem',
      fontWeight: 500,
      px: 1.5,
      py: 0.6,
      color: gs.textSecondary,
      backgroundColor: 'transparent',
      border: `1px solid ${gs.border}`,
      '&:hover': {
        backgroundColor: gs.bgHover,
        borderColor: gs.borderDarker,
      },
    },

    // 主按钮
    primaryButton: {
      textTransform: 'none' as const,
      borderRadius: '6px',
      fontSize: '0.8125rem',
      fontWeight: 500,
      px: 1.5,
      py: 0.6,
      color: isDark ? '#FFFFFF' : '#FFFFFF',
      backgroundColor: isDark ? '#E5E7EB' : '#111827',
      '&:hover': {
        backgroundColor: isDark ? '#D1D5DB' : '#374151',
      },
    },

    // 搜索框
    searchBox: {
      '& .MuiOutlinedInput-root': {
        backgroundColor: gs.bgInput,
        borderRadius: '6px',
        fontSize: '0.8125rem',
        '& fieldset': {
          borderColor: gs.border,
        },
        '&:hover fieldset': {
          borderColor: gs.borderDarker,
        },
      },
    },

    // 表格头部
    tableHead: {
      backgroundColor: gs.bgHover,
      '& .MuiTableCell-head': {
        fontSize: '0.75rem',
        fontWeight: 600,
        color: gs.textMuted,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        py: 1,
      },
    },

    // 表格行
    tableRow: {
      '&:hover': {
        backgroundColor: gs.bgHover,
      },
      '& .MuiTableCell-body': {
        fontSize: '0.8125rem',
        color: gs.textSecondary,
        py: 1.5,
        borderBottom: `1px solid ${gs.border}`,
      },
    },

    // 状态标签
    statusChip: {
      fontSize: '0.6875rem',
      fontWeight: 500,
      height: 22,
      borderRadius: '4px',
    },

    // 对话框
    dialog: {
      '& .MuiDialog-paper': {
        backgroundColor: gs.bgPanel,
        border: `1px solid ${gs.border}`,
        borderRadius: '12px',
      },
    },

    // 输入框
    input: {
      '& .MuiOutlinedInput-root': {
        backgroundColor: gs.bgInput,
        borderRadius: '6px',
        '& fieldset': {
          borderColor: gs.borderDarker,
        },
        '&:hover fieldset': {
          borderColor: gs.border,
        },
      },
      '& .MuiInputLabel-root': {
        color: gs.textMuted,
        fontSize: '0.8125rem',
      },
    },

    // 标签
    label: {
      fontSize: '0.75rem',
      fontWeight: 500,
      color: gs.textMuted,
      mb: 0.5,
    },

    // 分隔线
    divider: {
      borderColor: gs.border,
      my: 2,
    },

    // 卡片
    card: {
      backgroundColor: gs.bgPanel,
      border: `1px solid ${gs.border}`,
      borderRadius: '8px',
      p: 2,
    },

    // 文字颜色快捷引用
    textPrimary: gs.textPrimary,
    textSecondary: gs.textSecondary,
    textMuted: gs.textMuted,
    textDisabled: gs.textDisabled,
    bgPanel: gs.bgPanel,
    bgHover: gs.bgHover,
    bgActive: gs.bgActive,
    border: gs.border,
    borderDarker: gs.borderDarker,
    borderLight: gs.borderLighter,
  };
}

// ===================== 兼容旧代码的常量导出（已废弃） =====================

/** @deprecated 使用 getModelManagerStyles(isDark).container */
export const CONTAINER_SX = { p: 3, backgroundColor: '#FAFAFA', minHeight: '100vh' };

/** @deprecated 使用 getModelManagerStyles(isDark).title */
export const TITLE_SX = { fontSize: '1.25rem', fontWeight: 600, color: '#111827', mb: 2 };

/** @deprecated 使用 getModelManagerStyles(isDark).toolbarButton */
export const TOOLBAR_BUTTON_SX = {
  textTransform: 'none',
  borderRadius: '6px',
  fontSize: '0.8125rem',
  fontWeight: 500,
  px: 1.5,
  py: 0.6,
  color: '#374151',
  backgroundColor: 'transparent',
  border: '1px solid #E5E7EB',
  '&:hover': { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' },
};

/** @deprecated 使用 getModelManagerStyles(isDark).primaryButton */
export const PRIMARY_BUTTON_SX = {
  textTransform: 'none',
  borderRadius: '6px',
  fontSize: '0.8125rem',
  fontWeight: 500,
  px: 1.5,
  py: 0.6,
  color: '#FFFFFF',
  backgroundColor: '#111827',
  '&:hover': { backgroundColor: '#374151' },
};

/** @deprecated 使用 getModelManagerStyles(isDark).searchBox */
export const SEARCH_SX = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#FFFFFF',
    borderRadius: '6px',
    fontSize: '0.8125rem',
    '& fieldset': { borderColor: '#E5E7EB' },
    '&:hover fieldset': { borderColor: '#D1D5DB' },
  },
};

/** @deprecated 使用 getModelManagerStyles(isDark).tableHead */
export const TABLE_HEAD_SX = {
  backgroundColor: '#F3F4F6',
  '& .MuiTableCell-head': {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    py: 1,
  },
};

/** @deprecated 使用 getModelManagerStyles(isDark).tableRow */
export const TABLE_ROW_SX = {
  '&:hover': { backgroundColor: '#F9FAFB' },
  '& .MuiTableCell-body': {
    fontSize: '0.8125rem',
    color: '#374151',
    py: 1.5,
    borderBottom: '1px solid #F3F4F6',
  },
};

/** @deprecated 使用 getModelManagerStyles(isDark).statusChip */
export const STATUS_CHIP_SX = { fontSize: '0.6875rem', fontWeight: 500, height: 22, borderRadius: '4px' };

/** @deprecated 使用 getModelManagerStyles(isDark).dialog */
export const DIALOG_SX = {
  '& .MuiDialog-paper': { backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px' },
};

/** @deprecated 使用 getModelManagerStyles(isDark).input */
export const INPUT_SX = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#FFFFFF',
    borderRadius: '6px',
    '& fieldset': { borderColor: '#E5E7EB' },
    '&:hover fieldset': { borderColor: '#D1D5DB' },
  },
  '& .MuiInputLabel-root': { color: '#6B7280', fontSize: '0.8125rem' },
};

/** @deprecated 使用 getModelManagerStyles(isDark).label */
export const LABEL_SX = { fontSize: '0.75rem', fontWeight: 500, color: '#6B7280', mb: 0.5 };

/** @deprecated 使用 getModelManagerStyles(isDark).divider */
export const DIVIDER_SX = { borderColor: '#E5E7EB', my: 2 };

/** @deprecated 使用 getModelManagerStyles(isDark).card */
export const CARD_SX = { backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', p: 2 };

// ===================== 兼容旧 COLORS 常量（已废弃，使用 getGrayScale） =====================

/** @deprecated 使用 getGrayScale(isDark) 或 getModelManagerStyles(isDark) */
export const COLORS = {
  textPrimary: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  textLight: '#9CA3AF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  bgHover: '#F9FAFB',
  success: '#10B981',
  successBg: '#F0FDF4',
  successHover: '#059669',
  error: '#EF4444',
  errorBg: '#FEE2E2',
  errorText: '#DC2626',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  info: '#3B82F6',
  infoBg: '#EFF6FF',
  infoText: '#2563EB',
} as const;

/** @deprecated 使用 getModelManagerStyles(isDark).toolbarButton */
export const toolbarButtonSx = {
  textTransform: 'none' as const,
  borderRadius: '6px',
  fontSize: '0.8125rem',
  fontWeight: 500,
  px: 1.5,
  py: 0.6,
  color: '#374151',
  backgroundColor: 'transparent',
  border: '1px solid #E5E7EB',
  '&:hover': { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' },
};

/** @deprecated 使用 getModelManagerStyles(isDark).primaryButton */
export const primaryButtonSx = {
  textTransform: 'none' as const,
  borderRadius: '6px',
  fontSize: '0.8125rem',
  fontWeight: 500,
  px: 1.5,
  py: 0.6,
  color: '#FFFFFF',
  backgroundColor: '#111827',
  '&:hover': { backgroundColor: '#374151' },
};

/** @deprecated 使用 getModelManagerStyles(isDark) */
export const switchSx = {
  '& .MuiSwitch-switchBase': {
    '&.Mui-checked': { color: '#111827', '& + .MuiSwitch-track': { backgroundColor: '#111827' } },
  },
};

/** @deprecated 使用 getModelManagerStyles(isDark).input */
export const textFieldSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#FFFFFF',
    borderRadius: '6px',
    '& fieldset': { borderColor: '#E5E7EB' },
    '&:hover fieldset': { borderColor: '#D1D5DB' },
  },
  '& .MuiInputLabel-root': { color: '#6B7280', fontSize: '0.8125rem' },
};

/** @deprecated */
export const sliderLabelSx = { fontSize: '0.75rem', fontWeight: 500, color: '#6B7280', mb: 0.5 };

/** @deprecated */
export const sliderValueSx = { fontSize: '0.75rem', color: '#6B7280', minWidth: 32, textAlign: 'right' as const };
