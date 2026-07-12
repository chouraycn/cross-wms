import React from 'react';
import { Box, Tooltip, Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';

interface QualityBadgeProps {
  quality: 'A' | 'B' | 'C' | 'D';
  issues: string[];
  suggestion: string;
}

const QUALITY_CONFIG: Record<string, {
  label: string;
  color: string;
  bgcolor: string;
  border: string;
  icon: React.ReactElement;
}> = {
  A: {
    label: 'A',
    color: '#22C55E',
    bgcolor: 'rgba(34,197,94,0.08)',
    border: 'rgba(34,197,94,0.25)',
    icon: <CheckCircleIcon sx={{ fontSize: 14 }} />,
  },
  B: {
    label: 'B',
    color: '#3B82F6',
    bgcolor: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.25)',
    icon: <InfoIcon sx={{ fontSize: 14 }} />,
  },
  C: {
    label: 'C',
    color: '#F59E0B',
    bgcolor: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.25)',
    icon: <WarningIcon sx={{ fontSize: 14 }} />,
  },
  D: {
    label: 'D',
    color: '#EF4444',
    bgcolor: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
    icon: <ErrorIcon sx={{ fontSize: 14 }} />,
  },
};

const QualityBadge: React.FC<QualityBadgeProps> = ({ quality, issues, suggestion }) => {
  const config = QUALITY_CONFIG[quality] || QUALITY_CONFIG.C;

  const tooltipContent = (
    <Box sx={{ maxWidth: 320 }}>
      <Box sx={{ fontWeight: 600, mb: 0.5 }}>质量评分: {quality}</Box>
      {issues.length > 0 && (
        <Box sx={{ mb: 0.5 }}>
          <Box sx={{ fontSize: 12, fontWeight: 600, mb: 0.25 }}>问题:</Box>
          {issues.map((issue, i) => (
            <Box key={i} sx={{ fontSize: 12, pl: 1, mb: 0.25 }}>• {issue}</Box>
          ))}
        </Box>
      )}
      {suggestion && (
        <Box sx={{ fontSize: 12, mt: 0.5 }}>
          <Box sx={{ fontWeight: 600, mb: 0.25 }}>建议:</Box>
          {suggestion}
        </Box>
      )}
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow placement="top">
      <Chip
        size="small"
        label={`质量 ${quality}`}
        icon={config.icon}
        sx={{
          height: 22,
          fontSize: 11,
          fontWeight: 600,
          color: config.color,
          bgcolor: config.bgcolor,
          border: `1px solid ${config.border}`,
          cursor: 'default',
          '& .MuiChip-icon': { color: config.color },
        }}
      />
    </Tooltip>
  );
};

export default QualityBadge;
