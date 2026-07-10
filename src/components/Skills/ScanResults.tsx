import React from 'react';
import { Box, Typography, Chip, Alert, AlertTitle } from '@mui/material';
import type { ProposalScan } from '../../types/proposal';
import type { GrayScale } from '../../constants/theme';

interface ScanResultsProps {
  scan: ProposalScan;
  gs: GrayScale;
  isDark: boolean;
}

export const ScanResults: React.FC<ScanResultsProps> = ({ scan, gs, isDark }) => {
  const { critical, warn, info, findings } = scan;

  const severity = critical > 0 ? 'error' : warn > 0 ? 'warning' : 'success';

  const levelColors: Record<string, { bg: string; color: string; icon: string }> = {
    critical: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444', icon: '🛑' },
    high: { bg: 'rgba(239,68,68,0.1)', color: '#EF4444', icon: '⚠️' },
    medium: { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', icon: '⚡' },
    low: { bg: 'rgba(59,130,246,0.1)', color: '#3B82F6', icon: 'ℹ️' },
    none: { bg: 'rgba(34,197,94,0.1)', color: '#22C55E', icon: '✅' },
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Chip
          label={`Critical: ${critical}`}
          size="small"
          sx={{
            bgcolor: critical > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.1)',
            color: critical > 0 ? '#EF4444' : gs.textMuted,
            fontWeight: 500,
          }}
        />
        <Chip
          label={`Warning: ${warn}`}
          size="small"
          sx={{
            bgcolor: warn > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(107,114,128,0.1)',
            color: warn > 0 ? '#F59E0B' : gs.textMuted,
            fontWeight: 500,
          }}
        />
        <Chip
          label={`Info: ${info}`}
          size="small"
          sx={{
            bgcolor: info > 0 ? 'rgba(59,130,246,0.1)' : 'rgba(107,114,128,0.1)',
            color: info > 0 ? '#3B82F6' : gs.textMuted,
            fontWeight: 500,
          }}
        />
      </Box>

      {findings.length > 0 && (
        <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
          {findings.map((finding, index) => {
            const config = levelColors[finding.level] || levelColors.info;
            return (
              <Alert
                key={`${finding.type}-${index}`}
                severity={finding.level === 'critical' ? 'error' : finding.level === 'high' || finding.level === 'medium' ? 'warning' : 'info'}
                sx={{
                  mb: 1,
                  p: 1.5,
                  fontSize: 12,
                  bgcolor: config.bg,
                  borderLeft: `3px solid ${config.color}`,
                  '& .MuiAlert-message': { fontSize: 12 },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{ fontSize: 14 }}>{config.icon}</Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: config.color, mb: 0.25 }}>
                      {finding.type}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: gs.textSecondary }}>
                      {finding.description}
                    </Typography>
                  </Box>
                </Box>
              </Alert>
            );
          })}
        </Box>
      )}

      {findings.length === 0 && (
        <Alert severity="success" sx={{ fontSize: 12, p: 1.5 }}>
          <AlertTitle sx={{ fontSize: 12, fontWeight: 600 }}>扫描完成</AlertTitle>
          未发现安全风险
        </Alert>
      )}
    </Box>
  );
};

export default ScanResults;