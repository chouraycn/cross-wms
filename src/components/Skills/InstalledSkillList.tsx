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
        transition: 'all 0.2s ease',
        '&:hover': { backgroundColor: gs.bgHover },
      }}
      onClick={() => onNavigate(skill.id)}
    >
      {/* 图标 */}
      <Box sx={{
        width: 48,
        height: 48,
        borderRadius: '10px',
        background: getCategoryGradient(skill.category),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: gs.bgPanel,
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
          mb: 0.25,
        }}>
          {skill.name}
        </Typography>
        <Typography sx={{
          fontSize: '0.8125rem',
          color: gs.textSecondary,
          lineHeight: 1.5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
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
          fontSize: '0.875rem',
          fontWeight: 600,
          color: gs.textPrimary,
          mb: 1.5,
        }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
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
