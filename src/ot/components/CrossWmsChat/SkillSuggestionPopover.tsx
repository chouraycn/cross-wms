import React from 'react';
import { Box, Typography, Popover, useTheme } from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { ICON_MAP } from '../../types/skill';
import type { Skill, SkillSuggestionItem } from '../../types/skill';
import { getGrayScale } from '../../constants/theme';

// ===================== 类型 =====================

/** 增强的建议项，携带完整 Skill 对象用于渲染图标和回调 */
export interface PopoverSuggestion {
  suggestion: SkillSuggestionItem;
  skill: Skill;
  /** T04: 是否处于冲突状态（多个候选得分接近） */
  isConflicted?: boolean;
}

export interface SkillSuggestionPopoverProps {
  /** 锚点元素 */
  anchorEl: HTMLElement | null;
  /** 建议列表（含完整 Skill） */
  suggestions: PopoverSuggestion[];
  /** 选中回调 */
  onSelect: (skill: Skill) => void;
  /** 是否打开 */
  open: boolean;
}

// ===================== 组件 =====================

const SkillSuggestionPopover: React.FC<SkillSuggestionPopoverProps> = ({
  anchorEl,
  suggestions,
  onSelect,
  open,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  if (!open || suggestions.length === 0) return null;

  const displayItems = suggestions.slice(0, 3);

  // T04: 检测是否有任何建议项处于冲突状态
  const hasAnyConflict = displayItems.some((item) => item.isConflicted === true);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'left',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'left',
      }}
      onClose={() => {}}
      disableAutoFocus
      disableEnforceFocus
      slotProps={{
        paper: {
          elevation: 0,
          sx: {
            mt: 0.5,
            borderRadius: '8px',
            border: `1px solid ${gs.border}`,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            minWidth: 260,
          },
        },
      }}
    >
      {/* T04: 冲突提示条 */}
      {hasAnyConflict && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 2,
            py: 0.5,
            backgroundColor: '#FEF3C7',
          }}
        >
          <WarningAmberIcon sx={{ fontSize: 12, color: '#EA580C' }} />
          <Typography sx={{ fontSize: '0.7rem', color: '#EA580C', fontWeight: 500 }}>
            可能匹配多个技能，请选择
          </Typography>
        </Box>
      )}

      {displayItems.map(({ suggestion: item, skill, isConflicted }) => (
        <Box
          key={item.id}
          onClick={() => onSelect(skill)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1.25,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            bgcolor: isConflicted ? '#FFFBEB' : '#EFF6FF',
            color: '#2563EB',
            // T04: 冲突项用橙色左边框区分
            borderLeft: isConflicted ? '3px solid #EA580C' : 'none',
            '&:hover': {
              bgcolor: isConflicted ? '#FEF3C7' : '#DBEAFE',
            },
            '&:not(:last-child)': {
              borderBottom: `1px solid ${isDark ? gs.border : '#E8F0FE'}`,
            },
          }}
        >
          {/* 图标 */}
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: isConflicted ? '#EA580C' : '#2563EB',
              '& .MuiSvgIcon-root': { fontSize: 18, color: isConflicted ? '#EA580C' : '#2563EB' },
            }}
          >
            {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 18 }} />}
          </Box>

          {/* 信息 */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: isConflicted ? '#92400E' : '#2563EB',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {skill.name}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.6875rem',
                color: isConflicted ? '#B45309' : gs.textMuted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 200,
              }}
            >
              {(skill.desc || '').length > 30
                ? skill.desc.slice(0, 30) + '...'
                : (skill.desc || '')}
            </Typography>
          </Box>

          {/* 匹配分数 */}
          <Typography
            sx={{
              fontSize: '0.625rem',
              color: isConflicted ? '#D97706' : '#93C5FD',
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            {Math.round(item.matchScore * 100)}%
          </Typography>
        </Box>
      ))}
    </Popover>
  );
};

export default SkillSuggestionPopover;
