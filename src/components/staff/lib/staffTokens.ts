import type { SxProps, Theme } from '@mui/material/styles'

/**
 * Staff 设计 token 单一事实来源（MUI 化）。
 *
 * 背景：staff 模块原先依赖一套平行的 teal/近黑 Tailwind 主题（staffdeck.css +
 * tailwind.config.js），与 cross-wms 主程序的靛蓝 MUI 主题分叉。本文件把所有
 * 颜色 / 间距统一映射到主程序 MUI 主题（`primary.main` 等），使 staff 在视觉上
 * 并入主程序，并作为后续逐文件迁移的单一来源。
 *
 * 消费方式：
 *   - MUI 组件：<Box sx={staffTokens.mobileCard} />
 *   - 需要合并时：<MuiMenuItem sx={[staffTokens.menuItem] as SxProps} />
 *   - 数组形式需 `as SxProps` 以通过联合类型检查。
 */

export const staffTokens = {
  // —— 移动端列表卡片 ——
  mobileCard: {
    minWidth: 0,
    borderRadius: '8px',
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    p: '14px',
  },

  // —— 下拉菜单容器 ——
  menuContent: {
    display: 'flex',
    width: 'auto',
    minWidth: '140px',
    flexDirection: 'column',
    gap: '4px',
    borderRadius: '14px',
    border: 0,
    bgcolor: 'background.paper',
    p: '4px',
    boxShadow: '0px 0px 8px rgba(0,0,0,0.1)',
  },

  // —— 下拉菜单项（中性，作为 DropdownMenuItem 内部 base） ——
  menuItem: {
    position: 'relative',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '10px',
    px: '12px',
    py: '6px',
    fontSize: '12px',
    color: 'text.secondary',
    '&[data-state="open"], &:focus, &:hover': {
      color: 'text.primary',
      bgcolor: 'action.hover',
    },
    '&[data-inset="true"]': { pl: '28px' },
    '&[data-disabled="true"], &[aria-disabled="true"]': {
      opacity: 0.5,
      pointerEvents: 'none',
    },
    '& svg': { width: '14px', height: '14px' },
  },

  // —— 下拉菜单项（危险/红） ——
  menuItemDanger: {
    position: 'relative',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '10px',
    px: '12px',
    py: '6px',
    fontSize: '12px',
    color: 'error.main',
    '&:hover, &:focus': { bgcolor: '#fce7e7', color: 'error.main' },
    '&[data-disabled="true"], &[aria-disabled="true"]': {
      opacity: 0.5,
      pointerEvents: 'none',
    },
    '& svg': { width: '14px', height: '14px' },
  },

  // —— Select 触发器（34px 过滤控件） ——
  selectTrigger: {
    height: '34px',
    borderRadius: '10px',
    border: '0.5px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    fontSize: '12px',
    color: 'text.primary',
    boxShadow: 'none',
    '& .MuiSelect-placeholder': { color: 'text.secondary' },
    '&:hover': { borderColor: 'text.disabled' },
    '&.Mui-focused': { borderColor: 'text.primary', boxShadow: 'none' },
  },

  // —— 描边操作按钮（toolbar / card header） ——
  outlineActionButton: {
    minWidth: 0,
    height: '34px',
    gap: '4px',
    borderRadius: '10px',
    border: '0.5px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    px: '20px',
    fontSize: '12px',
    color: 'text.secondary',
    textTransform: 'none',
    '&:hover': {
      borderColor: 'text.disabled',
      bgcolor: 'background.paper',
      color: 'text.primary',
    },
  },
  outlineActionButtonSm: {
    minWidth: 0,
    height: '32px',
    gap: '4px',
    borderRadius: '10px',
    border: '0.5px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    px: '12px',
    fontSize: '12px',
    color: 'text.primary',
    textTransform: 'none',
    '&:hover': {
      borderColor: 'text.disabled',
      bgcolor: 'action.hover',
      color: 'text.primary',
    },
    '& svg': { width: '14px', height: '14px' },
  },

  // —— 搜索组合（input + 提交按钮） ——
  searchCombo: {
    display: 'flex',
    height: '32px',
    minWidth: 0,
    alignItems: 'stretch',
    overflow: 'hidden',
    borderRadius: '10px',
    border: '0.5px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    transition: 'border-color 0.15s',
    '&:focus-within': { borderColor: 'text.primary' },
  },
  searchComboInput: {
    minWidth: 0,
    flex: 1,
    bgcolor: 'transparent',
    px: '14px',
    fontSize: '14px',
    color: 'text.primary',
    outline: 'none',
    border: 0,
    '&::placeholder': { color: 'text.disabled' },
  },
  searchComboButton: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    bgcolor: 'primary.main',
    px: '20px',
    fontSize: '14px',
    color: '#fff',
    border: 0,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    '&:hover': { bgcolor: 'primary.dark' },
    '&:disabled': { pointerEvents: 'none', opacity: 0.5 },
  },

  // —— 对话框底部 / 按钮 ——
  dialogFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    bgcolor: 'background.paper',
    px: '24px',
    py: '12px',
  },
  dialogCancelButton: {
    height: '32px',
    minWidth: '80px',
    borderRadius: '10px',
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    px: '12px',
    fontSize: '14px',
    color: 'text.primary',
    textTransform: 'none',
    '&:hover': {
      borderColor: 'divider',
      bgcolor: 'action.hover',
      color: 'text.primary',
    },
  },
  dialogPrimaryButton: {
    height: '32px',
    minWidth: '80px',
    borderRadius: '10px',
    bgcolor: 'primary.main',
    px: '12px',
    fontSize: '14px',
    color: '#fff',
    border: 0,
    textTransform: 'none',
    '&:hover': { bgcolor: 'primary.dark' },
  },

  // —— 区块卡片 / 标题（蒸馏页等） ——
  sectionCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    borderRadius: '20px 20px 0 0',
    bgcolor: 'background.paper',
    p: '18px',
    boxShadow: '0 -4px 16px 0 rgba(0,0,0,0.05)',
  },
  sectionCardTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'text.primary',
  },
  returnButton: {
    height: '32px',
    gap: '4px',
    borderRadius: '10px',
    border: '0.5px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    px: '20px',
    fontSize: '12px',
    color: 'text.secondary',
    textTransform: 'none',
    '&:hover': { borderColor: 'text.disabled', color: 'text.primary' },
  },
  primaryButton: {
    minWidth: 0,
    height: '32px',
    gap: '4px',
    borderRadius: '10px',
    bgcolor: 'primary.main',
    px: '20px',
    fontSize: '12px',
    color: '#fff',
    border: 0,
    textTransform: 'none',
    '&:hover': { bgcolor: 'primary.dark' },
  },
} satisfies Record<string, SxProps<Theme>>

export type StaffTokenName = keyof typeof staffTokens
