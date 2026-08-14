import React from 'react';
import {
  Box, Typography, Switch, Paper, IconButton, useTheme,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { getGrayScale, toggleSwitchSx } from '../../constants/theme';
import { ICON_MAP } from '../../types/skill';
import type { Skill } from '../../types/skill';
import { getCategoryGradient } from '../../constants/skillCategories';

export interface InstalledSkillListProps {
  skills: Skill[];
  onToggle: (skill: Skill, active: boolean) => void;
  onNavigate: (skillId: string) => void;
  /** 删除技能回调（仅 source !== 'builtin' 可删除） */
  onDelete?: (skill: Skill) => void;
}

const InstalledSkillItem: React.FC<{
  skill: Skill;
  onToggle: (skill: Skill, active: boolean) => void;
  onNavigate: (skillId: string) => void;
  onDelete?: (skill: Skill) => void;
}> = ({ skill, onToggle, onNavigate, onDelete }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const iconNode = ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 22 }} />;
  const isActive = skill.status === 'active';
  // 内置技能不允许删除
  const canDelete = onDelete && skill.source !== 'builtin';

  return (
    <Paper
      elevation={0}
      sx={{
        display: 'flex',
        alignItems: 'center',
        // 基于上一版基线，每个技能高度缩小 10%
        //   p: 2 (16px)     → p: 1.8 (14.4px, -10%)
        //   gap: 2 (16px)   → gap: 1.8 (14.4px, -10%)
        gap: 1.8,
        p: 1.8,
        borderRadius: '12px',
        border: `1px solid ${gs.border}`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: gs.bgHover,
          // 悬停整行时显示删除按钮（通过 [aria-label="删除技能"] 后代选择器，避免跨元素 sx 作用域问题）
          '& [aria-label="删除技能"]': { opacity: 1 },
        },
      }}
      onClick={() => onNavigate(skill.id)}
    >
      {/* 图标：48px → 43px（-10.4%），font 24→22（-8.3%），r 10→9（-10%）*/}
      <Box sx={{
        width: 43,
        height: 43,
        borderRadius: '9px',
        background: getCategoryGradient(skill.category),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: gs.bgPanel,
        '& .MuiSvgIcon-root': { fontSize: 22, color: gs.bgPanel },
      }}>
        {iconNode}
      </Box>

      {/* 名称 + 描述 */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: gs.textPrimary,
          // mb: 0.25 → 0.225（-10%）
          mb: 0.225,
        }}>
          {skill.name}
        </Typography>
        <Typography sx={{
          fontSize: '0.8125rem',
          color: gs.textSecondary,
          // lineHeight: 1.5 → 1.4（约 -7%，配合整体紧凑）
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {skill.desc}
        </Typography>
      </Box>

      {/* 删除按钮：默认隐藏，悬停显示（参考 skill 标签样式：颜色 #64748b） */}
      {canDelete && (
        <IconButton
          size="small"
          aria-label="删除技能"
          onClick={(e) => {
            e.stopPropagation();
            onDelete!(skill);
          }}
          sx={{
            // 与开关并列：默认透明，父 Paper 悬停时在 Paper 的 sx 后代选择器里把 opacity 置 1（避免跨元素 sx 作用域问题）
            opacity: 0,
            color: '#64748b',
            transition: 'opacity 0.18s ease, color 0.18s ease',
            // 删除按钮自身悬停：变红 + 浅红背景
            '&:hover': { color: '#EF4444', backgroundColor: '#FEF2F2' },
          }}
        >
          <DeleteOutlineIcon sx={{ fontSize: 18 }} />
        </IconButton>
      )}

      {/* 开关 */}
      <Switch
        checked={isActive}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onToggle(skill, e.target.checked)}
        sx={toggleSwitchSx(isDark)}
      />
    </Paper>
  );
};

const InstalledSkillList: React.FC<InstalledSkillListProps> = ({ skills, onToggle, onNavigate, onDelete }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const marketplaceSkills = skills.filter((s) => s.remoteId || s.marketplaceMetadata);
  const localSkills = skills.filter((s) => !s.remoteId && !s.marketplaceMetadata);

  const renderGroup = (title: string, items: Skill[]) => {
    if (items.length === 0) return null;
    return (
      // 分组 mb: 4 → 3.6（-10%）
      <Box key={title} sx={{ mb: 3.6 }}>
        <Typography sx={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: gs.textPrimary,
          // mb: 1.5 → 1.35（-10%）
          mb: 1.35,
        }}>
          {title}
        </Typography>
        {/* gap: 1.5 → 1.35（-10%） */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.35 }}>
          {items.map((skill) => (
            <InstalledSkillItem
              key={skill.id}
              skill={skill}
              onToggle={onToggle}
              onNavigate={onNavigate}
              onDelete={onDelete}
            />
          ))}
        </Box>
      </Box>
    );
  };

  return (
    <Box>
      {renderGroup('来自技能广场', marketplaceSkills)}
      {renderGroup('本地安装', localSkills)}
      {skills.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ fontSize: '0.95rem', color: gs.textMuted }}>
            暂无已安装技能
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default InstalledSkillList;
