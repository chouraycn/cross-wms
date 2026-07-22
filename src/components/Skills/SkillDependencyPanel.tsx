import React, { useState, useEffect } from 'react';
import { Box, Typography, Chip, Button, CircularProgress } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { useNavigate } from 'react-router-dom';
import { fetchSkillDependencies } from '../../services/api';
import type { SkillDepDetail } from '../../services/api';
import { getGrayScale } from '../../constants/theme';

interface SkillDependencyPanelProps {
  skillId: string;
  isDark: boolean;
}

const SkillDependencyPanel: React.FC<SkillDependencyPanelProps> = ({ skillId, isDark }) => {
  const navigate = useNavigate();
  const gs = getGrayScale(isDark);
  const [data, setData] = useState<SkillDepDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSkillDependencies(skillId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [skillId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3, color: gs.textMuted }}>
        <CircularProgress size={16} sx={{ color: gs.textMuted }} />
        <Typography sx={{ fontSize: '0.8125rem' }}>加载依赖信息...</Typography>
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ py: 2, color: gs.textMuted }}>
        <Typography sx={{ fontSize: '0.8125rem' }}>
          {error || '无法加载依赖信息'}
        </Typography>
      </Box>
    );
  }

  const hasDeps = data.dependencies.length > 0;
  const hasDependents = data.dependents.length > 0;
  const hasConflicts = data.conflicts.length > 0;
  const hasCycles = data.cycles.length > 0;
  const hasAny = hasDeps || hasDependents || hasConflicts || hasCycles;

  if (!hasAny) {
    return (
      <Box sx={{ py: 2 }}>
        <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>
          该技能没有声明任何依赖或冲突
        </Typography>
      </Box>
    );
  }

  const DepChip: React.FC<{
    label: string;
    required?: boolean;
    reason?: string;
    onClick?: () => void;
    variant?: 'dep' | 'dependent' | 'conflict';
  }> = ({ label, required, reason, onClick, variant = 'dep' }) => {
    const colors = {
      dep: { bg: required !== false ? '#EFF6FF' : '#F3F4F6', color: required !== false ? '#2563EB' : '#6B7280', border: required !== false ? '#BFDBFE' : '#E5E7EB' },
      dependent: { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' },
      conflict: { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
    };
    const c = colors[variant];
    return (
      <Chip
        label={label}
        size="small"
        onClick={onClick}
        sx={{
          height: 24,
          fontSize: '0.75rem',
          fontWeight: 500,
          backgroundColor: c.bg,
          color: c.color,
          border: `1px solid ${c.border}`,
          cursor: onClick ? 'pointer' : 'default',
          '&:hover': onClick ? { opacity: 0.85 } : {},
        }}
      />
    );
  };

  return (
    <Box>
      {/* 循环依赖警告 */}
      {hasCycles && (
        <Box sx={{
          mb: 2,
          p: 1.5,
          borderRadius: '8px',
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <ErrorOutlineIcon sx={{ fontSize: 18, color: '#DC2626', flexShrink: 0 }} />
          <Box>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#DC2626' }}>
              检测到循环依赖
            </Typography>
            {data.cycles.map((cycle, idx) => (
              <Typography key={idx} sx={{ fontSize: '0.75rem', color: '#B91C1C', mt: 0.25 }}>
                {cycle.join(' → ')} → {cycle[0]}
              </Typography>
            ))}
          </Box>
        </Box>
      )}

      {/* 冲突警告 */}
      {hasConflicts && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
            <WarningAmberIcon sx={{ fontSize: 16, color: '#DC2626' }} />
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#DC2626' }}>
              冲突声明 ({data.conflicts.length})
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {data.conflicts.map((c) => (
              <DepChip
                key={c.skillId}
                label={`${c.name}${c.reason ? ` (${c.reason})` : ''}`}
                variant="conflict"
                onClick={() => navigate(`/skills/${encodeURIComponent(c.skillId)}`)}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* 本技能依赖的其他技能 */}
      {hasDeps && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
            <ArrowForwardIcon sx={{ fontSize: 16, color: gs.textSecondary }} />
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: gs.textPrimary }}>
              依赖的技能 ({data.dependencies.length})
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {data.dependencies.map((dep) => (
              <DepChip
                key={dep.skillId}
                label={`${dep.name}${dep.required === false ? ' (可选)' : ''}`}
                required={dep.required !== false}
                reason={dep.reason}
                variant="dep"
                onClick={() => navigate(`/skills/${encodeURIComponent(dep.skillId)}`)}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* 依赖本技能的技能 */}
      {hasDependents && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
            <AccountTreeIcon sx={{ fontSize: 16, color: gs.textSecondary }} />
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: gs.textPrimary }}>
              被以下技能依赖 ({data.dependents.length})
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {data.dependents.map((dep) => (
              <DepChip
                key={dep.skillId}
                label={dep.name}
                variant="dependent"
                onClick={() => navigate(`/skills/${encodeURIComponent(dep.skillId)}`)}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default SkillDependencyPanel;
