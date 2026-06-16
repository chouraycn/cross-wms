/**
 * 技能来源 Badge (v1.5.79)
 *
 * 根据 skillScope 渲染不同颜色来源标识：
 *   - builtin: 蓝底 "系统"
 *   - project: 绿底 "项目"
 *   - user:    橙底 "个人"
 */
import React from 'react';
import { Chip } from '@mui/material';

interface SkillSourceBadgeProps {
  scope: string;
  size?: 'small' | 'medium';
}

const SOURCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  builtin: { label: '系统', color: '#2563EB', bg: '#EFF6FF' },
  project: { label: '项目', color: '#059669', bg: '#ECFDF5' },
  user:    { label: '个人', color: '#EA580C', bg: '#FFF7ED' },
};

export const SkillSourceBadge: React.FC<SkillSourceBadgeProps> = ({ scope, size = 'small' }) => {
  const config = SOURCE_CONFIG[scope] || SOURCE_CONFIG.builtin;

  return (
    <Chip
      label={config.label}
      size={size}
      sx={{
        color: config.color,
        backgroundColor: config.bg,
        fontWeight: 500,
        fontSize: '0.6875rem',
        height: 20,
        '& .MuiChip-label': { px: 0.75 },
      }}
    />
  );
};

export default SkillSourceBadge;
