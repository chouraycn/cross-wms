import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

import { Sheet, SheetContent } from '../ui';
import { ChevronDown, Trash2, X } from '../icons';

import { platformResourceAccentStyles, type PlatformResourceAccent } from './PlatformResourceCard';
import { staffTokens } from '../lib/staffTokens.js';

export type PlatformResourceDrawerProps = {
  open: boolean;
  platformTitle: string;
  icon: ReactNode;
  accent?: PlatformResourceAccent;
  title: ReactNode;
  description: ReactNode;
  badge: ReactNode;
  categoryMeta: ReactNode;
  detailText: ReactNode;
  useLabel: string;
  canManage?: boolean;
  deleting?: boolean;
  hasPrev?: boolean;
  hasNext?: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDelete?: () => void;
  onUse: () => void;
};

const DRAWER_SHEET_SX: SxProps<Theme> = {
  position: 'absolute',
  top: '24px !important',
  right: '24px !important',
  bottom: '24px !important',
  left: 'auto !important',
  height: 'auto !important',
  maxHeight: 'calc(100vh - 48px) !important',
  width: '400px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  border: '0.5px solid',
  borderColor: '#e3e7f1',
  bgcolor: '#fff',
  p: '16px 20px',
  boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
  borderRadius: '20px',
  maxWidth: { sm: '400px' },
};

function DrawerDivider() {
  return <Box sx={{ height: '1px', width: '100%', flexShrink: 0, bgcolor: '#e3e7f1' }} />;
}

function NavChevron({
  direction,
  disabled,
  onClick,
  label,
}: {
  direction: 'prev' | 'next';
  disabled?: boolean;
  onClick?: () => void;
  label: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      sx={{
        display: 'grid',
        width: '14px',
        height: '14px',
        placeItems: 'center',
        color: '#757f9c',
        transition: 'color 0.15s',
        '&:enabled:hover': { color: '#18181a' },
        '&:disabled': { cursor: 'not-allowed', opacity: 0.35 },
      }}
    >
      <ChevronDown size={14} style={{ transform: direction === 'prev' ? 'rotate(90deg)' : 'rotate(-90deg)' }} />
    </Box>
  );
}

/**
 * SD1 广场资源详情侧拉（知识库 298:4801 / SOP·技能·工具 298:4869 系列）。
 */
export default function PlatformResourceDrawer({
  open,
  platformTitle,
  icon,
  accent = 'green',
  title,
  description,
  badge,
  categoryMeta,
  detailText,
  useLabel,
  canManage = false,
  deleting = false,
  hasPrev = false,
  hasNext = false,
  onClose,
  onPrev,
  onNext,
  onDelete,
  onUse,
}: PlatformResourceDrawerProps) {
  const accentStyles = platformResourceAccentStyles[accent];

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} sx={DRAWER_SHEET_SX}>
        <Box sx={{ display: 'flex', width: '100%', flexShrink: 0, flexDirection: 'column', gap: '10px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Box
                component="span"
                sx={{ fontSize: '12px', fontWeight: 500, textTransform: 'capitalize', color: '#464c5e' }}
              >
                {platformTitle}
              </Box>
              <NavChevron direction="prev" disabled={!hasPrev} onClick={onPrev} label="上一项" />
              <NavChevron direction="next" disabled={!hasNext} onClick={onNext} label="下一项" />
            </Box>
            <Box
              component="button"
              type="button"
              aria-label="关闭"
              onClick={onClose}
              sx={{
                display: 'grid',
                width: '14px',
                height: '14px',
                placeItems: 'center',
                color: '#757f9c',
                transition: 'color 0.15s',
                '&:hover': { color: '#18181a' },
              }}
            >
              <X size={14} strokeWidth={1.75} />
            </Box>
          </Box>
          <DrawerDivider />
        </Box>

        <Box sx={{ display: 'flex', minHeight: 0, flex: 1, flexDirection: 'column', gap: '10px', overflowY: 'auto', px: '4px' }}>
          <Box sx={{ width: '36px', height: '36px', flexShrink: 0 }}>{icon}</Box>

          <Box sx={{ display: 'flex', minHeight: '75px', width: '100%', flexDirection: 'column', justifyContent: 'center', gap: '8px', pb: '2px' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Box
                component="p"
                sx={{ fontSize: '16px', fontWeight: 500, textTransform: 'capitalize', color: '#464c5e' }}
              >
                {title}
              </Box>
              <Box component="p" sx={{ fontSize: '12px', lineHeight: '18px', color: '#757f9c' }}>
                {description}
              </Box>
            </Box>
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                width: 'fit-content',
                alignItems: 'center',
                borderRadius: '90px',
                px: '10px',
                py: '4px',
                fontSize: '10px',
                textTransform: 'capitalize',
                ...accentStyles.tag,
              }}
            >
              {badge}
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
            <Box
              sx={{
                display: 'flex',
                minHeight: '60px',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '4px',
                borderRadius: '14px',
                border: '0.5px solid',
                borderColor: '#e3e7f1',
                px: '16px',
                py: '8px',
              }}
            >
              <Box component="span" sx={{ fontSize: '10px', lineHeight: '13px', color: '#464c5e' }}>分类</Box>
              <Box
                component="strong"
                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', lineHeight: '16px', fontWeight: 500, color: '#18181a' }}
              >
                {platformTitle}
              </Box>
            </Box>
            <Box
              sx={{
                display: 'flex',
                minHeight: '60px',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '4px',
                borderRadius: '14px',
                border: '0.5px solid',
                borderColor: '#e3e7f1',
                px: '16px',
                py: '8px',
              }}
            >
              <Box component="span" sx={{ fontSize: '10px', lineHeight: '13px', color: '#464c5e' }}>分类</Box>
              <Box
                component="strong"
                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', lineHeight: '16px', fontWeight: 500, ...accentStyles.meta }}
              >
                {categoryMeta}
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', minHeight: 0, flex: 1, flexDirection: 'column', gap: '8px' }}>
            <Box component="span" sx={{ fontSize: '12px', textTransform: 'capitalize', color: '#464c5e' }}>说明</Box>
            <Box component="p" sx={{ fontSize: '12px', lineHeight: '20px', color: '#757f9c' }}>
              {detailText}
            </Box>
          </Box>
        </Box>

        <DrawerDivider />

        <Box sx={{ display: 'flex', flexShrink: 0, justifyContent: 'flex-end', gap: '10px' }}>
          {canManage && onDelete && (
            <Box
              component="button"
              type="button"
              disabled={deleting}
              onClick={onDelete}
              sx={{
                display: 'inline-flex',
                height: '34px',
                width: '80px',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                borderRadius: '10px',
                border: '0.5px solid',
                borderColor: '#d20b0b',
                bgcolor: '#fff',
                fontSize: '12px',
                color: '#d20b0b',
                transition: 'background-color 0.15s, color 0.15s',
                '&:hover': { bgcolor: '#fce7e7' },
                '&:disabled': { cursor: 'not-allowed', opacity: 0.5 },
              }}
            >
              <Trash2 size={14} />
              删除
            </Box>
          )}
          <Box
            component="button"
            type="button"
            onClick={onUse}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...staffTokens.primaryButton,
              height: '34px',
            }}
          >
            {useLabel}
          </Box>
        </Box>
      </SheetContent>
    </Sheet>
  );
}
