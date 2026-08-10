import React from 'react';
import {
  Box, Typography, Switch, Paper, useTheme,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { getGrayScale } from '../../constants/theme';
import { ICON_MAP } from '../../types/skill';
import type { Skill } from '../../types/skill';
import { getCategoryGradient } from '../../constants/skillCategories';

export interface InstalledSkillListProps {
  skills: Skill[];
  onToggle: (skill: Skill, active: boolean) => void;
  onNavigate: (skillId: string) => void;
}

const InstalledSkillItem: React.FC<{
  skill: Skill;
  onToggle: (skill: Skill, active: boolean) => void;
  onNavigate: (skillId: string) => void;
}> = ({ skill, onToggle, onNavigate }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const iconNode = ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 22 }} />;
  const isActive = skill.status === 'active';

  return (
    <Paper
      elevation={0}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        borderRadius: '12px',
        border: `1px solid ${gs.border}`,
        cursor: 'pointer',
        backgroundColor: gs.bgPanel,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: gs.bgHover,
          borderColor: gs.borderDarker,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          transform: 'translateY(-1px)',
        },
      }}
      onClick={() => onNavigate(skill.id)}
    >
      {/* 图标 */}
      <Box sx={{
        width: 48,
        height: 48,
        borderRadius: '12px',
        background: getCategoryGradient(skill.category),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: gs.bgPanel,
        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
        transition: 'box-shadow 0.2s ease',
        '& .MuiSvgIcon-root': { fontSize: 24, color: gs.bgPanel },
      }}>
        {iconNode}
      </Box>

      {/* 名称 + 描述 */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: gs.textPrimary,
          mb: 0.375,
        }}>
          {skill.name}
        </Typography>
        <Typography sx={{
          fontSize: '0.8125rem',
          color: gs.textSecondary,
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {skill.desc}
        </Typography>
      </Box>

      {/* 开关 */}
      <Switch
        checked={isActive}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onToggle(skill, e.target.checked)}
        sx={{
          flexShrink: 0,
          '& .MuiSwitch-switchBase.Mui-checked': {
            color: '#22C55E',
          },
          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
            backgroundColor: '#86EFAC',
          },
          '& .MuiSwitch-track': {
            backgroundColor: gs.borderDarker,
          },
        }}
      />
    </Paper>
  );
};

const InstalledSkillList: React.FC<InstalledSkillListProps> = ({ skills, onToggle, onNavigate }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const marketplaceSkills = skills.filter((s) => s.remoteId || s.marketplaceMetadata);
  const localSkills = skills.filter((s) => !s.remoteId && !s.marketplaceMetadata);

  const renderGroup = (title: string, items: Skill[]) => {
    if (items.length === 0) return null;
    return (
      <Box key={title} sx={{ mb: 4 }}>
        <Typography sx={{
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: gs.textSecondary,
          mb: 1.5,
          px: 1.5,
          py: 0.5,
          borderRadius: '6px',
          backgroundColor: gs.bgHover,
          borderLeft: `2px solid ${gs.textPrimary}`,
          letterSpacing: '0.02em',
        }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map((skill) => (
            <InstalledSkillItem
              key={skill.id}
              skill={skill}
              onToggle={onToggle}
              onNavigate={onNavigate}
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
