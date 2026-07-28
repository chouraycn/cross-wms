import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

import { Sheet, SheetContent } from '../ui';
import { ChevronDown, Trash2, X } from '../icons';
import EmployeeAvatar from '../EmployeeAvatar';
import type { AgentProfileRead } from '../types';

import type { PlatformStat } from './PlatformEmployeeCard';
import { staffTokens } from '../lib/staffTokens.js';

export type PlatformEmployeeDrawerProps = {
  open: boolean;
  agent: AgentProfileRead;
  platformTitle: string;
  name: ReactNode;
  role: ReactNode;
  description: ReactNode;
  detailText: ReactNode;
  workStyles: string[];
  stats: PlatformStat[];
  online?: boolean;
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
 * SD1 数字员工广场详情侧拉（Figma 298:1416）。
 */
export default function PlatformEmployeeDrawer({
  open,
  agent,
  platformTitle,
  name,
  role,
  description,
  detailText,
  workStyles,
  stats,
  online = true,
  canManage = false,
  deleting = false,
  hasPrev = false,
  hasNext = false,
  onClose,
  onPrev,
  onNext,
  onDelete,
  onUse,
}: PlatformEmployeeDrawerProps) {
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
              <NavChevron direction="prev" disabled={!hasPrev} onClick={onPrev} label="上一位员工" />
              <NavChevron direction="next" disabled={!hasNext} onClick={onNext} label="下一位员工" />
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

        <Box sx={{ display: 'flex', minHeight: 0, flex: 1, flexDirection: 'column', gap: '10px', overflowY: 'auto', px: '4px', pt: '48px' }}>
          <Box sx={{ display: 'flex', width: '100%', alignItems: 'flex-end', gap: '10px', pb: '4px' }}>
            <Box sx={{ display: 'flex', height: '117.5px', width: '100px', flexShrink: 0, alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}>
              <EmployeeAvatar
                agent={agent}
                width={100}
                height={118}
                fit="contain"
                objectPosition="center bottom"
                className="overflow-visible! rounded-none! border-0! bg-transparent! bg-none! shadow-none! after:hidden!"
              />
            </Box>
            <Box sx={{ display: 'flex', minWidth: 0, flex: 1, flexDirection: 'column', justifyContent: 'center', gap: '8px', pb: '2px' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Box
                  component="p"
                  sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '16px', fontWeight: 500, textTransform: 'capitalize', color: '#464c5e' }}
                >
                  {name}
                </Box>
                <Box
                  component="p"
                  sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '12px', lineHeight: '18px', color: '#757f9c' }}
                >
                  {description}
                </Box>
              </Box>
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  width: 'fit-content',
                  alignItems: 'center',
                  gap: '4px',
                  borderRadius: '90px',
                  border: '0.5px solid',
                  px: '10px',
                  py: '4px',
                  fontSize: '10px',
                  textTransform: 'capitalize',
                  ...(online
                    ? { borderColor: '#96d9b0', bgcolor: '#e9f7ef', color: '#2cb360' }
                    : { borderColor: '#d1d5db', bgcolor: '#f3f4f6', color: '#757f9c' }),
                }}
              >
                <Box
                  component="i"
                  aria-hidden="true"
                  sx={{
                    width: '4px',
                    height: '4px',
                    flexShrink: 0,
                    borderRadius: '9999px',
                    boxShadow: 'inset 1px 1px 2px 0.5px rgba(0,0,0,0.05)',
                    bgcolor: online ? '#22c55e' : '#9ca3af',
                  }}
                />
                <Box component="span" sx={{ fontSize: '10px', textTransform: 'capitalize' }}>
                  {online ? '在线' : '下线'}
                </Box>
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', width: '100%', alignItems: 'stretch' }}>
            {stats.map((stat, index) => (
              <Box
                key={stat.label}
                sx={{
                  display: 'flex',
                  height: '60px',
                  flex: 1,
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: '4px',
                  border: '0.5px solid',
                  borderColor: '#e3e7f1',
                  px: '20px',
                  py: '8px',
                  ...(index === 0 ? { borderTopLeftRadius: '14px', borderBottomLeftRadius: '14px' } : {}),
                  ...(index === stats.length - 1 ? { borderTopRightRadius: '14px', borderBottomRightRadius: '14px' } : {}),
                  ...(index > 0 ? { borderLeft: 0 } : {}),
                }}
              >
                <Box component="strong" sx={{ fontSize: '18px', fontWeight: 500, color: '#18181a' }}>{stat.value}</Box>
                <Box component="span" sx={{ fontSize: '10px', color: '#464c5e' }}>{stat.label}</Box>
              </Box>
            ))}
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
                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', lineHeight: '16px', fontWeight: 500, color: '#18181a' }}
              >
                {role}
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', minHeight: 0, flex: 1, flexDirection: 'column', gap: '8px' }}>
            <Box component="span" sx={{ fontSize: '12px', textTransform: 'capitalize', color: '#464c5e' }}>说明</Box>
            <Box sx={{ display: 'flex', minHeight: 0, flex: 1, flexDirection: 'column', gap: '10px' }}>
              {workStyles.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {workStyles.slice(0, 3).map((tag) => (
                    <Box
                      key={tag}
                      component="span"
                      sx={{ borderRadius: '10px', bgcolor: '#f6f6f6', px: '12px', py: '4px', fontSize: '12px', color: '#757f9c' }}
                    >
                      {tag}
                    </Box>
                  ))}
                </Box>
              )}
              <Box component="p" sx={{ fontSize: '12px', lineHeight: '20px', color: '#757f9c' }}>
                {detailText}
              </Box>
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
                borderColor: '#e3e7f1',
                bgcolor: '#fff',
                fontSize: '12px',
                color: '#757f9c',
                transition: 'background-color 0.15s, color 0.15s, border-color 0.15s',
                '&:hover': { borderColor: '#d20b0b', color: '#d20b0b' },
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
              width: '80px',
            }}
          >
            使用员工
          </Box>
        </Box>
      </SheetContent>
    </Sheet>
  );
}
