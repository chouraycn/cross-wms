import React, { useState } from 'react';
import {
  Box, Typography, Button, Paper, Stack, Chip, Divider,
  TextField, IconButton, Alert,
} from '@mui/material';
import { ArrowLeft, ContentCopy, Check, X } from '@mui/icons-material';
import type { SkillProposal } from '../../types/proposal';
import type { GrayScale } from '../../constants/theme';
import { applyProposal, rejectProposal, quarantineProposal, rollbackProposal } from '../../services/proposalApi';
import ScanResults from './ScanResults';

interface ProposalDetailProps {
  proposal: SkillProposal;
  gs: GrayScale;
  isDark: boolean;
  onBack: () => void;
  onUpdate: (proposal: SkillProposal) => void;
}

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待审批', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  applied: { label: '已应用', color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  rejected: { label: '已拒绝', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  quarantined: { label: '已隔离', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  stale: { label: '已过期', color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
};

const typeLabels: Record<string, { label: string; color: string }> = {
  create: { label: '创建', color: '#8B5CF6' },
  update: { label: '更新', color: '#06B6D4' },
};

export const ProposalDetail: React.FC<ProposalDetailProps> = ({ proposal, gs, isDark, onBack, onUpdate }) => {
  const [actionReason, setActionReason] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusConfig = statusLabels[proposal.status];
  const typeConfig = typeLabels[proposal.type];

  const handleApply = async () => {
    setLoadingAction(true);
    try {
      const result = await applyProposal(proposal.id);
      onUpdate(result.proposal);
    } catch (e) {
      console.error('Failed to apply proposal:', e);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleReject = async () => {
    if (!actionReason.trim()) return;
    setLoadingAction(true);
    try {
      const result = await rejectProposal(proposal.id, actionReason);
      onUpdate(result.proposal);
    } catch (e) {
      console.error('Failed to reject proposal:', e);
    } finally {
      setLoadingAction(false);
      setActionReason('');
    }
  };

  const handleQuarantine = async () => {
    if (!actionReason.trim()) return;
    setLoadingAction(true);
    try {
      const result = await quarantineProposal(proposal.id, actionReason);
      onUpdate(result.proposal);
    } catch (e) {
      console.error('Failed to quarantine proposal:', e);
    } finally {
      setLoadingAction(false);
      setActionReason('');
    }
  };

  const handleRollback = async () => {
    setLoadingAction(true);
    try {
      const result = await rollbackProposal(proposal.id);
      onUpdate(result.proposal);
    } catch (e) {
      console.error('Failed to rollback proposal:', e);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(proposal.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderActions = () => {
    switch (proposal.status) {
      case 'pending':
        return (
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              onClick={handleApply}
              disabled={loadingAction || proposal.scan.critical > 0}
              sx={{
                bgcolor: '#22C55E',
                '&:hover': { bgcolor: '#16A34A' },
                '&:disabled': { bgcolor: '#6B7280', cursor: 'not-allowed' },
              }}
            >
              {proposal.scan.critical > 0 ? '存在高风险' : '应用提案'}
            </Button>
            <Button
              variant="outlined"
              onClick={handleQuarantine}
              disabled={loadingAction}
              sx={{ borderColor: '#F59E0B', color: '#F59E0B', '&:hover': { borderColor: '#D97706', bgcolor: 'rgba(245,158,11,0.08)' } }}
            >
              隔离
            </Button>
            <Button
              variant="outlined"
              onClick={handleReject}
              disabled={loadingAction}
              sx={{ borderColor: '#EF4444', color: '#EF4444', '&:hover': { borderColor: '#DC2626', bgcolor: 'rgba(239,68,68,0.08)' } }}
            >
              拒绝
            </Button>
          </Stack>
        );
      case 'applied':
        return (
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              onClick={handleRollback}
              disabled={loadingAction || !proposal.rollback}
              sx={{
                bgcolor: '#F59E0B',
                '&:hover': { bgcolor: '#D97706' },
                '&:disabled': { bgcolor: '#6B7280', cursor: 'not-allowed' },
              }}
            >
              回滚
            </Button>
          </Stack>
        );
      case 'quarantined':
        return (
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              onClick={handleApply}
              disabled={loadingAction}
              sx={{ bgcolor: '#22C55E', '&:hover': { bgcolor: '#16A34A' } }}
            >
              批准应用
            </Button>
            <Button
              variant="outlined"
              onClick={handleReject}
              disabled={loadingAction}
              sx={{ borderColor: '#EF4444', color: '#EF4444', '&:hover': { borderColor: '#DC2626', bgcolor: 'rgba(239,68,68,0.08)' } }}
            >
              拒绝
            </Button>
          </Stack>
        );
      default:
        return null;
    }
  };

  const needsReason = proposal.status === 'pending' || proposal.status === 'quarantined';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={onBack}>
          <ArrowLeft sx={{ fontSize: 20 }} />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 600, color: gs.textPrimary }}>
          提案详情
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 2,
            border: `1px solid ${gs.border}`,
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Chip
              label={typeConfig.label}
              sx={{ bgcolor: `${typeConfig.color}20`, color: typeConfig.color }}
            />
            <Chip
              label={statusConfig.label}
              sx={{ bgcolor: statusConfig.bg, color: statusConfig.color }}
            />
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
            {proposal.skillName}
          </Typography>

          <Typography variant="body2" sx={{ color: gs.textMuted, mb: 1 }}>
            提案 ID: {proposal.id}
          </Typography>

          <Typography variant="body2" sx={{ color: gs.textMuted }}>
            创建时间: {new Date(proposal.createdAt).toLocaleString()}
          </Typography>

          {proposal.appliedAt && (
            <Typography variant="body2" sx={{ color: '#22C55E', mt: 1 }}>
              应用时间: {new Date(proposal.appliedAt).toLocaleString()}
            </Typography>
          )}

          {proposal.rejectedAt && (
            <Typography variant="body2" sx={{ color: '#EF4444', mt: 1 }}>
              拒绝时间: {new Date(proposal.rejectedAt).toLocaleString()}
            </Typography>
          )}

          {proposal.reviewNote && (
            <Alert severity="info" sx={{ mt: 2, fontSize: 12 }}>
              审批备注: {proposal.reviewNote}
            </Alert>
          )}
        </Paper>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 2,
            border: `1px solid ${gs.border}`,
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary }}>
              安全扫描结果
            </Typography>
          </Box>
          <ScanResults scan={proposal.scan} gs={gs} isDark={isDark} />
        </Paper>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 2,
            border: `1px solid ${gs.border}`,
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary }}>
              提案内容
            </Typography>
            <IconButton onClick={handleCopyContent} size="small">
              {copied ? <Check sx={{ fontSize: 16, color: '#22C55E' }} /> : <ContentCopy sx={{ fontSize: 16 }} />}
            </IconButton>
          </Box>
          <Box
            sx={{
              p: 2,
              borderRadius: 1,
              bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
              fontFamily: 'monospace',
              fontSize: 12,
              maxHeight: 300,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: gs.textSecondary,
            }}
          >
            {proposal.content}
          </Box>
        </Paper>

        {proposal.rollback && (
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 2,
              border: `1px solid ${gs.border}`,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary, mb: 2 }}>
              回滚内容（应用前版本）
            </Typography>
            <Box
              sx={{
                p: 2,
                borderRadius: 1,
                bgcolor: 'rgba(245,158,11,0.1)',
                fontFamily: 'monospace',
                fontSize: 12,
                maxHeight: 200,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: gs.textSecondary,
              }}
            >
              {proposal.rollback.previousContent}
            </Box>
          </Paper>
        )}

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary, mb: 2 }}>
            审批操作
          </Typography>

          {needsReason && (
            <TextField
              label="操作原因（选填）"
              multiline
              rows={2}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
              placeholder="输入拒绝或隔离的原因..."
            />
          )}

          {renderActions()}

          {proposal.status === 'applied' && !proposal.rollback && (
            <Typography variant="body2" sx={{ color: gs.textMuted, mt: 2 }}>
              无法回滚：没有保存的先前版本
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default ProposalDetail;