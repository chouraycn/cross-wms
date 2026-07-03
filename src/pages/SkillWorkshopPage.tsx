import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Tabs, Tab, Paper, Tooltip, CircularProgress,
  useTheme, Alert, LinearProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import UndoIcon from '@mui/icons-material/Undo';
import SecurityIcon from '@mui/icons-material/Security';
import DownloadIcon from '@mui/icons-material/Download';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import type {
  WorkshopProposal,
  WorkshopProposalStatus,
  WorkshopStats,
  SkillInstallSpec,
  SkillInstallProgress,
} from '../types/skill-core';
import {
  fetchWorkshopProposals,
  fetchWorkshopStats,
  applyWorkshopProposal,
  rejectWorkshopProposal,
  quarantineWorkshopProposal,
  rollbackWorkshopProposal,
  createWorkshopProposal,
  connectSkillInstallSSE,
} from '../services/api';

// ===================== 辅助组件 =====================

const STATUS_COLORS: Record<WorkshopProposalStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: '#FEF3C7', text: '#D97706', label: '待审批' },
  applied: { bg: '#D1FAE5', text: '#059669', label: '已应用' },
  rejected: { bg: '#FEE2E2', text: '#DC2626', label: '已拒绝' },
  quarantined: { bg: '#F3E8FF', text: '#7C3AED', label: '已隔离' },
  stale: { bg: '#F3F4F6', text: '#6B7280', label: '已过期' },
};

function StatusChip({ status }: { status: WorkshopProposalStatus }) {
  const cfg = STATUS_COLORS[status];
  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{
        backgroundColor: cfg.bg,
        color: cfg.text,
        fontWeight: 600,
        fontSize: '0.7rem',
        height: 22,
      }}
    />
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Paper
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 100,
      }}
    >
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</Typography>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>{label}</Typography>
    </Paper>
  );
}

// ===================== 主页面 =====================

const SkillWorkshopPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [proposals, setProposals] = useState<WorkshopProposal[]>([]);
  const [stats, setStats] = useState<WorkshopStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<WorkshopProposalStatus | 'all'>('all');

  // 创建提案对话框
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ type: 'create' as 'create' | 'update', skillName: '', content: '' });
  const [createLoading, setCreateLoading] = useState(false);

  // 拒绝/隔离对话框
  const [actionDialog, setActionDialog] = useState<{ open: boolean; type: 'reject' | 'quarantine'; proposalId: string; reason: string }>({
    open: false, type: 'reject', proposalId: '', reason: '',
  });

  // 安装对话框
  const [installOpen, setInstallOpen] = useState(false);
  const [installForm, setInstallForm] = useState<SkillInstallSpec>({ source: 'git', url: '', name: '' });
  const [installProgress, setInstallProgress] = useState<SkillInstallProgress | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installConnection, setInstallConnection] = useState<{ close: () => void } | null>(null);

  // 详情抽屉
  const [detailProposal, setDetailProposal] = useState<WorkshopProposal | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [proposalsRes, statsRes] = await Promise.all([
        fetchWorkshopProposals(tab === 'all' ? undefined : { status: tab }),
        fetchWorkshopStats(),
      ]);
      setProposals(proposalsRes.proposals);
      setStats(statsRes);
    } catch (e) {
      showToast(`加载失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredProposals = useMemo(() => {
    if (tab === 'all') return proposals;
    return proposals.filter((p) => p.status === tab);
  }, [proposals, tab]);

  const handleApply = async (id: string) => {
    try {
      await applyWorkshopProposal(id);
      showToast('提案已应用', 'success');
      loadData();
    } catch (e) {
      showToast(`应用失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const handleRollback = async (id: string) => {
    try {
      await rollbackWorkshopProposal(id);
      showToast('提案已回滚', 'success');
      loadData();
    } catch (e) {
      showToast(`回滚失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const handleCreate = async () => {
    if (!createForm.skillName.trim() || !createForm.content.trim()) {
      showToast('请填写技能名称和内容', 'warning');
      return;
    }
    setCreateLoading(true);
    try {
      await createWorkshopProposal({
        type: createForm.type,
        skillName: createForm.skillName,
        content: createForm.content,
      });
      showToast('提案创建成功', 'success');
      setCreateOpen(false);
      setCreateForm({ type: 'create', skillName: '', content: '' });
      loadData();
    } catch (e) {
      showToast(`创建失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleActionConfirm = async () => {
    const { type, proposalId, reason } = actionDialog;
    if (!reason.trim()) {
      showToast('请填写原因', 'warning');
      return;
    }
    try {
      if (type === 'reject') {
        await rejectWorkshopProposal(proposalId, reason);
        showToast('提案已拒绝', 'success');
      } else {
        await quarantineWorkshopProposal(proposalId, reason);
        showToast('提案已隔离', 'success');
      }
      setActionDialog({ open: false, type: 'reject', proposalId: '', reason: '' });
      loadData();
    } catch (e) {
      showToast(`操作失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const handleInstall = () => {
    if (!installForm.url?.trim() && !installForm.path?.trim()) {
      showToast('请填写安装来源', 'warning');
      return;
    }
    setInstalling(true);
    setInstallProgress(null);
    const conn = connectSkillInstallSSE(installForm, {
      onProgress: (p) => setInstallProgress(p),
      onResult: () => {
        showToast('安装完成', 'success');
        setInstalling(false);
      },
      onError: (err) => {
        showToast(`安装失败: ${err}`, 'error');
        setInstalling(false);
      },
    });
    setInstallConnection(conn);
  };

  useEffect(() => {
    return () => {
      installConnection?.close();
    };
  }, [installConnection]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      {/* 标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
          Skill Workshop
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={() => setInstallOpen(true)}
          >
            安装技能
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
          >
            创建提案
          </Button>
          <IconButton size="small" onClick={loadData} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* 统计卡片 */}
      {stats && (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <StatCard label="总计" value={stats.total} color={gs.textPrimary} />
          <StatCard label="待审批" value={stats.pending} color={STATUS_COLORS.pending.text} />
          <StatCard label="已应用" value={stats.applied} color={STATUS_COLORS.applied.text} />
          <StatCard label="已拒绝" value={stats.rejected} color={STATUS_COLORS.rejected.text} />
          <StatCard label="已隔离" value={stats.quarantined} color={STATUS_COLORS.quarantined.text} />
        </Box>
      )}

      {/* 状态筛选 */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ minHeight: 36, '& .MuiTabs-flexContainer': { gap: 0.5 } }}
        textColor="primary"
        indicatorColor="primary"
      >
        <Tab value="all" label="全部" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
        <Tab value="pending" label="待审批" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
        <Tab value="applied" label="已应用" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
        <Tab value="rejected" label="已拒绝" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
        <Tab value="quarantined" label="已隔离" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
        <Tab value="stale" label="已过期" sx={{ textTransform: 'none', minHeight: 36, fontSize: '0.8rem' }} />
      </Tabs>

      {/* 提案列表 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {loading && <LinearProgress sx={{ borderRadius: 1 }} />}
        {!loading && filteredProposals.length === 0 && (
          <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4, fontSize: '0.875rem' }}>
            暂无提案
          </Typography>
        )}
        {filteredProposals.map((p) => (
          <Paper
            key={p.id}
            sx={{
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              cursor: 'pointer',
              '&:hover': { borderColor: 'primary.main', backgroundColor: gs.bgHover },
            }}
            onClick={() => setDetailProposal(p)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StatusChip status={p.status} />
                <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{p.skillName}</Typography>
                <Chip label={p.type === 'create' ? '创建' : '更新'} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
              </Box>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>
                {new Date(p.createdAt).toLocaleString()}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                {p.skillPath}
              </Typography>
              {p.scan.critical > 0 && (
                <Tooltip title={`${p.scan.critical} 个严重风险`}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                    <WarningIcon sx={{ fontSize: 14, color: '#DC2626' }} />
                    <Typography sx={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 600 }}>{p.scan.critical}</Typography>
                  </Box>
                </Tooltip>
              )}
              {p.scan.warn > 0 && (
                <Tooltip title={`${p.scan.warn} 个警告`}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                    <SecurityIcon sx={{ fontSize: 14, color: '#D97706' }} />
                    <Typography sx={{ fontSize: '0.7rem', color: '#D97706', fontWeight: 600 }}>{p.scan.warn}</Typography>
                  </Box>
                </Tooltip>
              )}
            </Box>

            {/* 操作按钮 */}
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              {p.status === 'pending' && (
                <>
                  <Button size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={(e) => { e.stopPropagation(); handleApply(p.id); }} sx={{ textTransform: 'none', fontSize: '0.7rem' }}>
                    应用
                  </Button>
                  <Button size="small" variant="outlined" color="error" startIcon={<CancelIcon />} onClick={(e) => { e.stopPropagation(); setActionDialog({ open: true, type: 'reject', proposalId: p.id, reason: '' }); }} sx={{ textTransform: 'none', fontSize: '0.7rem' }}>
                    拒绝
                  </Button>
                  <Button size="small" variant="outlined" color="warning" startIcon={<WarningIcon />} onClick={(e) => { e.stopPropagation(); setActionDialog({ open: true, type: 'quarantine', proposalId: p.id, reason: '' }); }} sx={{ textTransform: 'none', fontSize: '0.7rem' }}>
                    隔离
                  </Button>
                </>
              )}
              {p.status === 'applied' && (
                <Button size="small" variant="outlined" startIcon={<UndoIcon />} onClick={(e) => { e.stopPropagation(); handleRollback(p.id); }} sx={{ textTransform: 'none', fontSize: '0.7rem' }}>
                  回滚
                </Button>
              )}
            </Box>
          </Paper>
        ))}
      </Box>

      {/* 创建提案对话框 */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>创建技能提案</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant={createForm.type === 'create' ? 'contained' : 'outlined'} size="small" onClick={() => setCreateForm((s) => ({ ...s, type: 'create' }))} sx={{ textTransform: 'none' }}>创建</Button>
            <Button variant={createForm.type === 'update' ? 'contained' : 'outlined'} size="small" onClick={() => setCreateForm((s) => ({ ...s, type: 'update' }))} sx={{ textTransform: 'none' }}>更新</Button>
          </Box>
          <TextField
            label="技能名称"
            size="small"
            value={createForm.skillName}
            onChange={(e) => setCreateForm((s) => ({ ...s, skillName: e.target.value }))}
            fullWidth
          />
          <TextField
            label="SKILL.md 内容"
            size="small"
            value={createForm.content}
            onChange={(e) => setCreateForm((s) => ({ ...s, content: e.target.value }))}
            fullWidth
            multiline
            rows={12}
            placeholder={`---\nname: 示例技能\ndescription: 这是一个示例技能\n---\n\n# 示例技能\n\n## 概述\n\n这里写技能的功能描述...`}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} size="small" sx={{ textTransform: 'none' }}>取消</Button>
          <Button onClick={handleCreate} variant="contained" size="small" disabled={createLoading} sx={{ textTransform: 'none' }}>
            {createLoading ? <CircularProgress size={16} /> : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 拒绝/隔离对话框 */}
      <Dialog open={actionDialog.open} onClose={() => setActionDialog((s) => ({ ...s, open: false }))} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>
          {actionDialog.type === 'reject' ? '拒绝提案' : '隔离提案'}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            label="原因"
            size="small"
            value={actionDialog.reason}
            onChange={(e) => setActionDialog((s) => ({ ...s, reason: e.target.value }))}
            fullWidth
            multiline
            rows={3}
            placeholder={`请输入${actionDialog.type === 'reject' ? '拒绝' : '隔离'}原因...`}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog((s) => ({ ...s, open: false }))} size="small" sx={{ textTransform: 'none' }}>取消</Button>
          <Button onClick={handleActionConfirm} variant="contained" color={actionDialog.type === 'reject' ? 'error' : 'warning'} size="small" sx={{ textTransform: 'none' }}>
            确认
          </Button>
        </DialogActions>
      </Dialog>

      {/* 安装技能对话框 */}
      <Dialog open={installOpen} onClose={() => { setInstallOpen(false); installConnection?.close(); setInstalling(false); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>安装技能</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {(['git', 'local', 'archive', 'market', 'http'] as const).map((s) => (
              <Button
                key={s}
                variant={installForm.source === s ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setInstallForm((f) => ({ ...f, source: s }))}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
              >
                {s === 'git' && 'Git'}
                {s === 'local' && '本地'}
                {s === 'archive' && '压缩包'}
                {s === 'market' && '市场'}
                {s === 'http' && 'HTTP'}
              </Button>
            ))}
          </Box>
          <TextField
            label={installForm.source === 'local' ? '本地路径' : 'URL'}
            size="small"
            value={installForm.source === 'local' ? (installForm.path || '') : (installForm.url || '')}
            onChange={(e) => setInstallForm((f) =>
              f.source === 'local' ? { ...f, path: e.target.value } : { ...f, url: e.target.value }
            )}
            fullWidth
            placeholder={installForm.source === 'git' ? 'https://github.com/xxx/xxx.git' : installForm.source === 'local' ? '/path/to/skill' : 'https://...'}
          />
          <TextField
            label="技能名称（可选）"
            size="small"
            value={installForm.name || ''}
            onChange={(e) => setInstallForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
          />
          {installing && installProgress && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {installProgress.message || installProgress.stage}
              </Typography>
              <LinearProgress
                variant={typeof installProgress.progress === 'number' ? 'determinate' : 'indeterminate'}
                value={installProgress.progress || 0}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setInstallOpen(false); installConnection?.close(); setInstalling(false); }} size="small" sx={{ textTransform: 'none' }}>取消</Button>
          <Button onClick={handleInstall} variant="contained" size="small" disabled={installing} sx={{ textTransform: 'none' }}>
            {installing ? <CircularProgress size={16} /> : '安装'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 详情对话框 */}
      <Dialog open={!!detailProposal} onClose={() => setDetailProposal(null)} maxWidth="md" fullWidth>
        {detailProposal && (
          <>
            <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
              <StatusChip status={detailProposal.status} />
              {detailProposal.skillName}
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              {detailProposal.scan.critical > 0 && (
                <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
                  发现 {detailProposal.scan.critical} 个严重安全风险
                </Alert>
              )}
              {detailProposal.scan.warn > 0 && (
                <Alert severity="warning" sx={{ fontSize: '0.8rem' }}>
                  发现 {detailProposal.scan.warn} 个警告
                </Alert>
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 1, fontSize: '0.8rem' }}>
                <Typography sx={{ color: 'text.secondary' }}>ID</Typography>
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{detailProposal.id}</Typography>
                <Typography sx={{ color: 'text.secondary' }}>类型</Typography>
                <Typography>{detailProposal.type === 'create' ? '创建' : '更新'}</Typography>
                <Typography sx={{ color: 'text.secondary' }}>路径</Typography>
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{detailProposal.skillPath}</Typography>
                <Typography sx={{ color: 'text.secondary' }}>创建时间</Typography>
                <Typography>{new Date(detailProposal.createdAt).toLocaleString()}</Typography>
                <Typography sx={{ color: 'text.secondary' }}>更新时间</Typography>
                <Typography>{new Date(detailProposal.updatedAt).toLocaleString()}</Typography>
                {detailProposal.appliedAt && (
                  <>
                    <Typography sx={{ color: 'text.secondary' }}>应用时间</Typography>
                    <Typography>{new Date(detailProposal.appliedAt).toLocaleString()}</Typography>
                  </>
                )}
                {detailProposal.rejectedAt && (
                  <>
                    <Typography sx={{ color: 'text.secondary' }}>拒绝时间</Typography>
                    <Typography>{new Date(detailProposal.rejectedAt).toLocaleString()}</Typography>
                  </>
                )}
                {detailProposal.reviewNote && (
                  <>
                    <Typography sx={{ color: 'text.secondary' }}>审批备注</Typography>
                    <Typography>{detailProposal.reviewNote}</Typography>
                  </>
                )}
              </Box>
              {detailProposal.scan.findings.length > 0 && (
                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.8rem', mb: 0.5 }}>安全扫描结果</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {detailProposal.scan.findings.map((f, i) => (
                      <Paper key={i} sx={{ p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Chip
                            label={f.level}
                            size="small"
                            sx={{
                              fontSize: '0.65rem',
                              height: 18,
                              backgroundColor:
                                f.level === 'critical' ? '#FEE2E2' :
                                f.level === 'high' || f.level === 'warn' ? '#FEF3C7' : '#F3F4F6',
                              color:
                                f.level === 'critical' ? '#DC2626' :
                                f.level === 'high' || f.level === 'warn' ? '#D97706' : '#6B7280',
                            }}
                          />
                          <Typography sx={{ fontSize: '0.75rem', fontWeight: 500 }}>{f.type}</Typography>
                        </Box>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>{f.description}</Typography>
                      </Paper>
                    ))}
                  </Box>
                </Box>
              )}
              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: '0.8rem', mb: 0.5 }}>内容</Typography>
                <Paper sx={{ p: 1.5, borderRadius: 1, backgroundColor: gs.bgInput, overflow: 'auto', maxHeight: 300 }}>
                  <pre style={{ margin: 0, fontSize: '0.75rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {detailProposal.content}
                  </pre>
                </Paper>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailProposal(null)} size="small" sx={{ textTransform: 'none' }}>关闭</Button>
              {detailProposal.status === 'pending' && (
                <>
                  <Button onClick={() => { setDetailProposal(null); handleApply(detailProposal.id); }} variant="contained" color="success" size="small" sx={{ textTransform: 'none' }}>应用</Button>
                  <Button onClick={() => { setDetailProposal(null); setActionDialog({ open: true, type: 'reject', proposalId: detailProposal.id, reason: '' }); }} variant="outlined" color="error" size="small" sx={{ textTransform: 'none' }}>拒绝</Button>
                </>
              )}
              {detailProposal.status === 'applied' && (
                <Button onClick={() => { setDetailProposal(null); handleRollback(detailProposal.id); }} variant="outlined" size="small" sx={{ textTransform: 'none' }}>回滚</Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default SkillWorkshopPage;
