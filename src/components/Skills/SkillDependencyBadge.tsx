// SkillDependencyBadge — compact pill that surfaces the runtime-requirement status
// of a skill. Renders nothing when the skill declares no runtime requirements.
import React, { useMemo } from 'react';
import { Chip, Tooltip, Box } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import {
  detectSkillRuntimeRequirements,
  type SkillRuntimeRequirement,
} from '../../utils/skillDependency';

export interface SkillDependencyBadgeProps {
  requirements?: SkillRuntimeRequirement[];
  /** Compact mode shows only the icon (no label). Useful in dense lists. */
  compact?: boolean;
}

const labelFor = (status: 'available' | 'missing' | 'unknown') => {
  switch (status) {
    case 'available':
      return '依赖完整';
    case 'missing':
      return '缺少依赖';
    case 'unknown':
      return '依赖待确认';
  }
};

const colorFor = (
  status: 'available' | 'missing' | 'unknown',
): 'success' | 'error' | 'default' => {
  switch (status) {
    case 'available':
      return 'success';
    case 'missing':
      return 'error';
    case 'unknown':
      return 'default';
  }
};

const iconFor = (status: 'available' | 'missing' | 'unknown') => {
  switch (status) {
    case 'available':
      return <CheckCircleIcon sx={{ fontSize: 14 }} />;
    case 'missing':
      return <ErrorOutlineIcon sx={{ fontSize: 14 }} />;
    case 'unknown':
      return <HelpOutlineIcon sx={{ fontSize: 14 }} />;
  }
};

const SkillDependencyBadge: React.FC<SkillDependencyBadgeProps> = ({
  requirements,
  compact = false,
}) => {
  const report = useMemo(
    () => detectSkillRuntimeRequirements(requirements),
    [requirements],
  );
  if (!requirements || requirements.length === 0) {
    return null;
  }
  const tooltipBody = report.details
    .map((d) => `${d.requirement.name} (${d.requirement.type}): ${d.status}${d.reason ? ` — ${d.reason}` : ''}`)
    .join('\n');
  return (
    <Tooltip title={tooltipBody} arrow placement="top">
      <Box component="span" sx={{ display: 'inline-flex' }}>
        <Chip
          size="small"
          color={colorFor(report.status)}
          icon={iconFor(report.status)}
          label={compact ? undefined : labelFor(report.status)}
          variant={report.status === 'available' ? 'outlined' : 'filled'}
          sx={{
            height: 22,
            fontSize: 11,
            '& .MuiChip-icon': { ml: compact ? 0 : 0.5 },
          }}
        />
      </Box>
    </Tooltip>
  );
};

export default React.memo(SkillDependencyBadge);
