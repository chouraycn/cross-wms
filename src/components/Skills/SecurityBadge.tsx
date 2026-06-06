import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import type { AuditLevel } from '../../types/skill';
import { AUDIT_LEVEL_LABELS, AUDIT_LEVEL_COLORS, AUDIT_LEVEL_BG } from '../../constants/skillCategories';

interface SecurityBadgeProps {
  level: AuditLevel | null | undefined;
  score?: number | null;
  onClick?: () => void;
  size?: 'small' | 'medium';
}

const SecurityBadge: React.FC<SecurityBadgeProps> = ({ level, score, onClick, size = 'small' }) => {
  if (!level) {
    return (
      <Tooltip title="待审查">
        <Chip
          label="待审查"
          size={size}
          sx={{
            bgcolor: '#F3F4F6',
            color: '#6B7280',
            fontSize: '0.7rem',
            height: 20,
            cursor: onClick ? 'pointer' : 'default',
            '& .MuiChip-label': { px: 1 },
          }}
          onClick={onClick}
        />
      </Tooltip>
    );
  }

  const label: string = AUDIT_LEVEL_LABELS[level] || level;
  const color: string = AUDIT_LEVEL_COLORS[level] || '#6B7280';
  const bg: string = AUDIT_LEVEL_BG[level] || '#F3F4F6';
  const tooltip: string = score != null ? `${label} · 评分 ${score}/100` : label;

  return (
    <Tooltip title={tooltip}>
      <Chip
        label={label}
        size={size}
        sx={{
          bgcolor: bg,
          color: color,
          fontSize: '0.7rem',
          height: 20,
          fontWeight: 600,
          cursor: onClick ? 'pointer' : 'default',
          '& .MuiChip-label': { px: 1 },
        }}
        onClick={onClick}
      />
    </Tooltip>
  );
};

export default SecurityBadge;
