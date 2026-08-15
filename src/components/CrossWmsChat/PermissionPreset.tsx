import React from 'react';
import { Box, Typography, Tooltip, useTheme } from '@mui/material';
import { getGrayScale } from '../../constants/theme';

export type PermissionLevel = 'readonly' | 'query' | 'modify' | 'confirm';

const PERMISSION_LEVELS: {
  level: PermissionLevel;
  label: string;
  desc: string;
  color: string;
  icon: string;
}[] = [
  { level: 'readonly', label: '仅咨询', desc: 'AI 只能回答问题，不执行任何操作', color: '#6B7280', icon: '💬' },
  { level: 'query', label: '可查单据', desc: 'AI 可以查询库存、订单等数据', color: '#2563EB', icon: '🔍' },
  { level: 'modify', label: '可改单据', desc: 'AI 可以创建/修改入库单、出库单等', color: '#F59E0B', icon: '✏️' },
  { level: 'confirm', label: '需确认', desc: 'AI 执行操作前需要你确认', color: '#EF4444', icon: '🔒' },
];

interface PermissionPresetProps {
  value: PermissionLevel;
  onChange: (level: PermissionLevel) => void;
}

export const PermissionPreset = React.memo(function PermissionPreset({
  value,
  onChange,
}: PermissionPresetProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        p: 0.25,
        borderRadius: '9999px',
        bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      }}
    >
      {PERMISSION_LEVELS.map((level) => {
        const active = level.level === value;
        return (
          <Tooltip key={level.level} title={level.desc} arrow placement="top">
            <Box
              component="button"
              onClick={() => onChange(level.level)}
              sx={{
                px: 1.25,
                py: 0.4,
                borderRadius: '9999px',
                cursor: 'pointer',
                border: 'none',
                bgcolor: active ? level.color + '15' : 'transparent',
                transition: 'all 0.15s',
                '&:hover': {
                  bgcolor: active
                    ? level.color + '15'
                    : isDark
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(0,0,0,0.06)',
                },
              }}
            >
              <Typography
                component="span"
                sx={{
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  color: active ? level.color : gs.textMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                {`${level.icon} ${level.label}`}
              </Typography>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
});

export { PERMISSION_LEVELS };
export default PermissionPreset;
