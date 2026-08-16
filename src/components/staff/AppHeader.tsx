// AppHeader — 数字员工模块通用页头（标题 + 描述 + 返回 + 自定义右侧操作区）。
// v1.7.235: 已移除右上角登录/用户菜单（桌面端无员工认证登录体系，无需身份入口）。
import type { ReactNode } from 'react';
import { Box } from '@mui/material';

export type AppHeaderProps = {
  left?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  className?: string;
  showBack?: boolean;
  onBack?: () => void;
};

export default function AppHeader({
  left,
  title,
  description,
  right,
  className,
  showBack,
  onBack,
}: AppHeaderProps) {
  const backButton = showBack ? (
    <Box
      component="button"
      type="button"
      onClick={onBack}
      aria-label="返回"
      sx={{
        mr: '4px',
        display: 'grid',
        width: '32px',
        height: '32px',
        flexShrink: 0,
        placeItems: 'center',
        borderRadius: '10px',
        outline: 'none',
        '&:hover': { bgcolor: 'var(--surface-muted)' },
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#343633" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </Box>
  ) : null;
  const leftContent = left ?? (
    <Box sx={{ display: 'flex', minHeight: '40px', alignItems: 'center', gap: '4px' }}>
      {backButton}
      {(title !== undefined || description !== undefined) ? (
        <Box sx={{ display: 'flex', minWidth: 0, flexDirection: 'column', justifyContent: 'center', gap: '4px' }}>
          {title !== undefined && (
            <Box component="p" sx={{ m: 0, fontSize: '16px', fontWeight: 500, lineHeight: 'normal', color: 'var(--ink-soft)' }}>{title}</Box>
          )}
          {description !== undefined && (
            <Box component="p" sx={{ m: 0, fontSize: '14px', lineHeight: 'normal', color: 'var(--muted-foreground)' }}>{description}</Box>
          )}
        </Box>
      ) : null}
    </Box>
  );

  return (
    <Box
      component="header"
      sx={{ display: 'flex', width: '100%', alignItems: 'flex-start', gap: '16px' }}
      className={className}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>{leftContent}</Box>
      {right !== undefined ? (
        <Box sx={{ display: 'flex', height: '32px', flexShrink: 0, alignItems: 'center', gap: '8px' }}>
          {right}
        </Box>
      ) : null}
    </Box>
  );
}
