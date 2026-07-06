/**
 * ModelManager 共享样式 - 使用统一灰阶 Token
 */
import { getGrayScale, getSemanticColors } from '../../../constants/theme';
import type { SemanticColors } from '../../../constants/theme';

/** 获取模型管理器样式（需传入主题模式） */
export function getModelManagerStyles(isDark: boolean) {
  const gs = getGrayScale(isDark);
  const sc = getSemanticColors(isDark);

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
      color: isDark ? '#111827' : '#FFFFFF',
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
    /** 灰阶快捷引用（供需要直接取值的场景） */
    bgInput: gs.bgInput,
    /** 语义化颜色（暗色模式适配） */
    semantic: sc,
  };
}
