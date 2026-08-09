import type { SxProps, Theme } from '@mui/material/styles'

/**
 * Staff 设计 token 单一事实来源（MUI 化）。
 *
 * 2026-08-09 对齐：原先把所有颜色映射到主程序 MUI 靛蓝主题（primary.main 等），
 * 导致数字员工域在 MUI 侧渲染成靛蓝灰，与 iframe 内 StaffDeck 的暖色 teal 设计系统
 * 不一致。现统一改为引用 `src/styles/staffdeck.css` 的 CSS 变量（与 StaffDeck-main
 * styles.css 对齐），使 staff 在视觉上并入数字员工样式：
 *   --primary #0f766e (teal) / --accent-soft #e1f1ed / --background #f7f5ef /
 *   --border #ded7cc / --foreground #20201d / --muted-foreground #6d726e 等。
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
    borderColor: 'var(--border)',
    bgcolor: 'var(--surface)',
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
    bgcolor: 'var(--surface)',
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
    color: 'var(--muted-foreground)',
    '&[data-state="open"], &:focus, &:hover': {
      color: 'var(--foreground)',
      bgcolor: 'var(--surface-muted)',
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
    color: 'var(--destructive)',
    '&:hover, &:focus': { bgcolor: 'var(--accent-soft)', color: 'var(--destructive)' },
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
    borderColor: 'var(--border)',
    bgcolor: 'var(--surface)',
    fontSize: '12px',
    color: 'var(--foreground)',
    boxShadow: 'none',
    '& .MuiSelect-placeholder': { color: 'var(--muted-foreground)' },
    '&:hover': { borderColor: 'var(--muted-soft)' },
    '&.Mui-focused': { borderColor: 'var(--foreground)', boxShadow: 'none' },
  },

  // —— 描边操作按钮（toolbar / card header） ——
  outlineActionButton: {
    minWidth: 0,
    height: '34px',
    gap: '4px',
    borderRadius: '10px',
    border: '0.5px solid',
    borderColor: 'var(--border)',
    bgcolor: 'var(--surface)',
    px: '20px',
    fontSize: '12px',
    color: 'var(--muted-foreground)',
    textTransform: 'none',
    '&:hover': {
      borderColor: 'var(--muted-soft)',
      bgcolor: 'var(--surface)',
      color: 'var(--foreground)',
    },
  },
  outlineActionButtonSm: {
    minWidth: 0,
    height: '32px',
    gap: '4px',
    borderRadius: '10px',
    border: '0.5px solid',
    borderColor: 'var(--border)',
    bgcolor: 'var(--surface)',
    px: '12px',
    fontSize: '12px',
    color: 'var(--foreground)',
    textTransform: 'none',
    '&:hover': {
      borderColor: 'var(--muted-soft)',
      bgcolor: 'var(--surface-muted)',
      color: 'var(--foreground)',
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
    borderColor: 'var(--border)',
    bgcolor: 'var(--surface)',
    transition: 'border-color 0.15s',
    '&:focus-within': { borderColor: 'var(--foreground)' },
  },
  searchComboInput: {
    minWidth: 0,
    flex: 1,
    bgcolor: 'transparent',
    px: '14px',
    fontSize: '14px',
    color: 'var(--foreground)',
    outline: 'none',
    border: 0,
    '&::placeholder': { color: 'var(--muted-soft)' },
  },
  searchComboButton: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    bgcolor: 'var(--primary)',
    px: '20px',
    fontSize: '14px',
    color: '#fff',
    border: 0,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    '&:hover': { bgcolor: '#0c5f59' },
    '&:disabled': { pointerEvents: 'none', opacity: 0.5 },
  },

  // —— 对话框底部 / 按钮 ——
  dialogFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    bgcolor: 'var(--surface)',
    px: '24px',
    py: '12px',
  },
  dialogCancelButton: {
    height: '32px',
    minWidth: '80px',
    borderRadius: '10px',
    border: '1px solid',
    borderColor: 'var(--border)',
    bgcolor: 'var(--surface)',
    px: '12px',
    fontSize: '14px',
    color: 'var(--foreground)',
    textTransform: 'none',
    '&:hover': {
      borderColor: 'var(--border)',
      bgcolor: 'var(--surface-muted)',
      color: 'var(--foreground)',
    },
  },
  dialogPrimaryButton: {
    height: '32px',
    minWidth: '80px',
    borderRadius: '10px',
    bgcolor: 'var(--primary)',
    px: '12px',
    fontSize: '14px',
    color: '#fff',
    border: 0,
    textTransform: 'none',
    '&:hover': { bgcolor: '#0c5f59' },
  },

  // —— 区块卡片 / 标题（蒸馏页等） ——
  sectionCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    borderRadius: '20px 20px 0 0',
    bgcolor: 'var(--surface)',
    p: '18px',
    boxShadow: '0 -4px 16px 0 rgba(0,0,0,0.05)',
  },
  sectionCardTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--foreground)',
  },
  returnButton: {
    height: '32px',
    gap: '4px',
    borderRadius: '10px',
    border: '0.5px solid',
    borderColor: 'var(--border)',
    bgcolor: 'var(--surface)',
    px: '20px',
    fontSize: '12px',
    color: 'var(--muted-foreground)',
    textTransform: 'none',
    '&:hover': { borderColor: 'var(--muted-soft)', color: 'var(--foreground)' },
  },
  primaryButton: {
    minWidth: 0,
    height: '32px',
    gap: '4px',
    borderRadius: '10px',
    bgcolor: 'var(--primary)',
    px: '20px',
    fontSize: '12px',
    color: '#fff',
    border: 0,
    textTransform: 'none',
    '&:hover': { bgcolor: '#0c5f59' },
  },
} satisfies Record<string, SxProps<Theme>>

export type StaffTokenName = keyof typeof staffTokens
