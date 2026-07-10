import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Chip } from '@mui/material';
import type { ProposalStats as ProposalStatsType, ProposalStatus, ProposalType } from '../../types/proposal';
import type { GrayScale } from '../../constants/theme';
import { getProposalStats } from '../../services/proposalApi';

interface ProposalStatsProps {
  gs: GrayScale;
  isDark: boolean;
}

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待审批', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  applied: { label: '已应用', color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  rejected: { label: '已拒绝', color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
  quarantined: { label: '已隔离', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  stale: { label: '已过期', color: '#6B7280', bg: 'rgba(107,114,128,0.15)' },
};

const typeLabels: Record<string, { label: string; color: string; bg: string }> = {
  create: { label: '创建', color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
  update: { label: '更新', color: '#06B6D4', bg: 'rgba(6,182,212,0.15)' },
};

export const ProposalStats: React.FC<ProposalStatsProps> = ({ gs, isDark }) => {
  const [stats, setStats] = useState<ProposalStatsType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const result = await getProposalStats();
        setStats(result.stats);
      } catch (e) {
        console.error('Failed to fetch proposal stats:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <Typography variant="body2" sx={{ color: gs.textMuted }}>加载统计数据...</Typography>
      </Box>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary, mb: 2 }}>
        提案统计
      </Typography>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 2,
          border: `1px solid ${gs.border}`,
          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        }}
      >
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#3B82F6', mb: 0.5 }}>
              {stats.total}
            </Typography>
            <Typography variant="caption" sx={{ color: gs.textMuted }}>总提案数</Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {Object.entries(statusLabels).map(([key, value]) => (
              <Chip
                key={key}
                label={`${value.label}: ${stats.byStatus[key as ProposalStatus] || 0}`}
                sx={{
                  bgcolor: value.bg,
                  color: value.color,
                  fontWeight: 500,
                }}
              />
            ))}
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            {Object.entries(typeLabels).map(([key, value]) => (
              <Chip
                key={key}
                label={`${value.label}: ${stats.byType[key as ProposalType] || 0}`}
                sx={{
                  bgcolor: value.bg,
                  color: value.color,
                  fontWeight: 500,
                }}
              />
            ))}
          </Box>
        </Box>

        {stats.byStatus.pending > 0 && (
          <Box sx={{ mt: 2, p: 2, borderRadius: 1, bgcolor: 'rgba(59,130,246,0.1)' }}>
            <Typography variant="body2" sx={{ color: '#3B82F6' }}>
              ⚡ 有 {stats.byStatus.pending} 个提案等待审批
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default ProposalStats;