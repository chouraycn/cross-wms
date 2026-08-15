/**
 * SkillDialogShell — 技能页面所有 Dialog 的统一样式外壳（100% 对齐 SkillPreviewDialog）
 *
 * 用法（最小示例）：
 *   <SkillDialogShell
 *     open={open}
 *     onClose={handleClose}
 *     maxWidth="sm"
 *     icon={<UploadFileIcon />}
 *     title="上传技能"
 *     subtitle="从 .zip / SKILL.md 导入到本地技能库"
 *     actions={
 *       <>
 *         <Button variant="outline">取消</Button>
 *         <Button variant="contained">安装</Button>
 *       </>
 *     }
 *   >
 *     {内容（自动滚动）}
 *   </SkillDialogShell>
 *
 * 规范（强制对齐 SkillPreviewDialog）：
 *   - Paper: 16px 圆角, shadow 0 12 48 rgba(0,0,0,.12), maxHeight 90vh, bgcolor #F7F7F8, overflow hidden
 *   - 头部: 40x40 白方图标盒（border #E5E7EB + 1px 阴影 0 1px 2px）+ 18px 600 #111827 标题 + 13px #6B7280 副标题 + 右上关闭按钮
 *   - 内容区: 自动 overflowY:auto，上下 padding 与预览弹窗一致
 *   - 主操作按钮风格: 黑色胶囊 (#111827 + 9999 圆角) 见 PrimaryPill / SecondaryGhost 导出
 */
import React from 'react';
import {
  Dialog,
  DialogProps,
  Box,
  Typography,
  IconButton,
  Button,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export interface SkillDialogShellProps
  extends Pick<DialogProps, 'open' | 'maxWidth' | 'fullWidth' | 'onClose' | 'disableEscapeKeyDown' | 'aria-labelledby'> {
  /** 头部 40x40 图标框里放的图标（任意 ReactNode，通常是 MUI SvgIcon） */
  icon?: React.ReactNode;
  /** 主标题（18px 600 #111827） */
  title: React.ReactNode;
  /** 副标题（13px #6B7280），传 null/undefined 则不显示 */
  subtitle?: React.ReactNode;
  /** 头部右侧额外节点（除了关闭按钮之外，放在关闭按钮左边） */
  headerExtra?: React.ReactNode;
  /** 是否隐藏右上角关闭按钮（极个别只允许显式按钮关闭的 Dialog） */
  hideCloseButton?: boolean;
  /** 底部操作区节点，放 Button 组；位置右对齐，间距 12px */
  actions?: React.ReactNode;
  /** DialogContent 区样式微调（覆盖默认 p 等） */
  contentSx?: React.CSSProperties | Record<string, unknown>;
  /** 传给 <Dialog> 额外的 sx / PaperProps，优先级高于内置 */
  sx?: React.CSSProperties | Record<string, unknown>;
  PaperPropsSx?: React.CSSProperties | Record<string, unknown>;
  /** children = 内容区（自动滚动） */
  children?: React.ReactNode;
}

export const SKILL_DIALOG_PAPER_SX = {
  borderRadius: '16px',
  boxShadow: '0 12px 48px rgba(0,0,0,0.12)',
  maxHeight: '90vh',
  bgcolor: '#F7F7F8',
  overflow: 'hidden',
} as const;

const SkillDialogShell: React.FC<SkillDialogShellProps> = ({
  open,
  onClose,
  maxWidth = 'sm',
  fullWidth = true,
  icon,
  title,
  subtitle,
  headerExtra,
  hideCloseButton,
  actions,
  contentSx,
  sx,
  PaperPropsSx,
  children,
  disableEscapeKeyDown,
  'aria-labelledby': ariaLabelledBy,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose as any}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      disableEscapeKeyDown={disableEscapeKeyDown}
      aria-labelledby={ariaLabelledBy}
      sx={sx as any}
      PaperProps={{
        sx: { ...SKILL_DIALOG_PAPER_SX, ...(PaperPropsSx || {}) } as any,
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        {/* ============ 标准头部 ============ */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3, pt: 2.5, pb: 2 }}>
          {icon != null && (
            <Box sx={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              bgcolor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: '#111827',
              boxShadow: '0 1px 2px rgba(17,24,39,0.04)',
            }}>
              {icon}
            </Box>
          )}

          <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
            <Typography sx={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#111827',
              lineHeight: 1.25,
            }}>
              {title}
            </Typography>
            {subtitle != null && subtitle !== '' && (
              <Typography sx={{ fontSize: '0.8125rem', color: '#6B7280', mt: 0.25, lineHeight: 1.4 }}>
                {subtitle}
              </Typography>
            )}
          </Box>

          {headerExtra}
          {!hideCloseButton && (
            <Tooltip title="关闭">
              <IconButton
                onClick={onClose as any}
                size="small"
                sx={{
                  color: '#6B7280',
                  '&:hover': { color: '#111827', bgcolor: 'rgba(17,24,39,0.05)' },
                }}
              >
                <CloseIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* ============ 内容区（滚动）============ */}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            px: 3,
            pb: actions ? 1.5 : 2.5,
            ...((contentSx || {}) as any),
          }}
        >
          {children}
        </Box>

        {/* ============ 底部按钮栏 ============ */}
        {actions != null && (
          <Box sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 1,
            px: 3,
            pb: 3,
            pt: 1.5,
            flexWrap: 'wrap',
          }}>
            {actions}
          </Box>
        )}
      </Box>
    </Dialog>
  );
};

/* ================ 统一按钮样式（对齐 SkillPreviewDialog 底部"使用"胶囊） ================ */

/**
 * PrimaryPill — 黑色胶囊主操作按钮（对应预览弹窗的"使用"）
 * 用法: <Button {...PrimaryPill}>安装技能</Button>
 */
export const PrimaryPill: React.ComponentProps<typeof Button> = {
  variant: 'contained',
  disableElevation: true,
  sx: {
    textTransform: 'none',
    borderRadius: '9999px',
    bgcolor: '#111827',
    color: '#FFFFFF',
    px: 3,
    py: 1,
    fontSize: '0.9375rem',
    fontWeight: 500,
    minWidth: 88,
    '&:hover': { bgcolor: '#000000' },
    '&:disabled': { bgcolor: '#D1D5DB', color: '#6B7280' },
  },
};

/**
 * SecondaryGhost — 次要按钮：白底灰边（对应"取消"），圆角 9999 保持胶囊家族
 * 用法: <Button {...SecondaryGhost}>取消</Button>
 */
export const SecondaryGhost: React.ComponentProps<typeof Button> = {
  variant: 'outlined',
  sx: {
    textTransform: 'none',
    borderRadius: '9999px',
    px: 3,
    py: 1,
    fontSize: '0.9375rem',
    fontWeight: 500,
    minWidth: 88,
    bgcolor: '#FFFFFF',
    color: '#374151',
    border: '1px solid #D1D5DB',
    '&:hover': { bgcolor: '#F9FAFB', borderColor: '#9CA3AF' },
    '&:disabled': { bgcolor: '#F9FAFB', color: '#9CA3AF', borderColor: '#E5E7EB' },
  },
};

/** 危险主操作：红色胶囊（用于删除） */
export const DangerPill: React.ComponentProps<typeof Button> = {
  ...PrimaryPill,
  sx: {
    ...(PrimaryPill.sx as any),
    bgcolor: '#DC2626',
    '&:hover': { bgcolor: '#B91C1C' },
  },
};

/** 警告主操作：橙色胶囊（用于"仍然安装/仍然导入"） */
export const WarningPill: React.ComponentProps<typeof Button> = {
  ...PrimaryPill,
  sx: {
    ...(PrimaryPill.sx as any),
    bgcolor: '#EA580C',
    '&:hover': { bgcolor: '#C2410C' },
  },
};

export default SkillDialogShell;
