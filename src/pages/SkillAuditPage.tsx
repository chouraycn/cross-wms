import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, CircularProgress, Button, Chip,
  Stack, Divider, List, ListItem, ListItemIcon, ListItemText,
  Accordion, AccordionSummary, AccordionDetails, IconButton, Menu, MenuItem,
  Snackbar, Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorIcon from '@mui/icons-material/Error';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoIcon from '@mui/icons-material/Info';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import * as api from '../services/api';
import { SkillAudit, AuditFinding } from '../types/skill';
import { AUDIT_LEVEL_COLORS, AUDIT_LEVEL_BG, AUDIT_LEVEL_LABELS } from '../constants/skillCategories';

const SkillAuditPage: React.FC = () => {
  const { skillId } = useParams<{ skillId: string }>();
  const navigate = useNavigate();
  const [audit, setAudit] = useState<SkillAudit | null>(null);
  const [history, setHistory] = useState<SkillAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'error' });

  useEffect(() => {
    loadData();
  }, [skillId]);

  const loadData = async () => {
    if (!skillId) return;
    setLoading(true);
    try {
      const [a, h] = await Promise.all([
        api.fetchSkillAudit(skillId),
        api.fetchSkillAuditHistory(skillId),
      ]);
      setAudit(a);
      setHistory(h);
    } catch (e) {
      console.error('加载审查数据失败', e);
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    if (!skillId) return;
    setLoading(true);
    try {
      const a = await api.triggerSkillAudit(skillId, '', true);
      setAudit(a);
      setHistory(prev => [a, ...prev]);
      setToast({ open: true, message: '重新审查完成', severity: 'success' });
    } catch (e: any) {
      console.error('重新审查失败', e);
      setToast({ open: true, message: `重新审查失败: ${e?.message || e}`, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'md' | 'pdf') => {
    if (!skillId) return;
    setExportAnchor(null);
    try {
      const content = await api.exportSkillAuditReport(skillId, format);
      const blob = new Blob([content], { type: format === 'md' ? 'text/markdown' : 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-${skillId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setToast({ open: true, message: '导出成功', severity: 'success' });
    } catch (e: any) {
      console.error('导出失败', e);
      setToast({ open: true, message: `导出失败: ${e?.message || e}`, severity: 'error' });
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!audit) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">暂无审查数据</Typography>
        <Button variant="outlined" onClick={handleRefresh} sx={{ mt: 2 }} startIcon={<RefreshIcon />} disabled={loading}>
          开始审查
        </Button>
      </Box>
    );
  }

  let report: any = {};
  try { report = JSON.parse(audit.reportJson); } catch {}

  const allFindings: AuditFinding[] = [
    ...(report.maliciousFindings || []),
    ...(report.suspiciousFindings || []),
    ...(report.informationalNotes || []),
  ];

  const severityIcon: Record<string, React.ReactNode> = {
    'malicious': <ErrorIcon sx={{ color: '#DC2626', fontSize: 20 }} />,
    'suspicious': <WarningAmberIcon sx={{ color: '#EA580C', fontSize: 20 }} />,
    'informational': <InfoIcon sx={{ color: '#6B7280', fontSize: 20 }} />,
  };

  return (
    <>
      <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      {/* 返回按钮 */}
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
        返回
      </Button>

      {/* 标题栏 */}
      <Paper sx={{ p: 3, mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>安全审查报告</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              审查时间：{new Date(audit.createdAt).toLocaleString()} · 触发方式：{audit.triggeredBy === 'import' ? '导入' : audit.triggeredBy === 'manual' ? '手动' : '热重载'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <IconButton onClick={handleRefresh} title="重新审查" disabled={loading}><RefreshIcon /></IconButton>
            <IconButton onClick={e => setExportAnchor(e.currentTarget)} title="导出"><DownloadIcon /></IconButton>
            <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
              <MenuItem onClick={() => handleExport('md')}>导出 Markdown</MenuItem>
              <MenuItem onClick={() => handleExport('pdf')} disabled>导出 PDF（即将支持）</MenuItem>
            </Menu>
          </Stack>
        </Stack>
      </Paper>

      {/* 评分卡片 */}
      <Paper sx={{ p: 3, mb: 2, textAlign: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <CircularProgress
              variant="determinate"
              value={audit.score}
              size={100}
              thickness={6}
              sx={{ color: AUDIT_LEVEL_COLORS[audit.level] }}
            />
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: AUDIT_LEVEL_COLORS[audit.level] }}>
                {audit.score}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ textAlign: 'left' }}>
            <Chip
              label={AUDIT_LEVEL_LABELS[audit.level]}
              sx={{ bgcolor: AUDIT_LEVEL_BG[audit.level], color: AUDIT_LEVEL_COLORS[audit.level], fontWeight: 600, mb: 1 }}
            />
            <Typography variant="body2" color="text.secondary">
              恶意风险：{report.summary?.maliciousCount || 0} 个
            </Typography>
            <Typography variant="body2" color="text.secondary">
              可疑风险：{report.summary?.suspiciousCount || 0} 个
            </Typography>
            <Typography variant="body2" color="text.secondary">
              信息提示：{report.summary?.informationalCount || 0} 个
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* 风险发现列表 */}
      {allFindings.length > 0 && (
        <Paper sx={{ p: 3, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>风险发现</Typography>
          <List dense>
            {allFindings.map((f, i) => (
              <ListItem key={i} divider={i < allFindings.length - 1}>
                <ListItemIcon sx={{ minWidth: 32 }}>{severityIcon[f.severity]}</ListItemIcon>
                <ListItemText
                  primary={f.description || f.type}
                  secondary={f.location}
                  primaryTypographyProps={{ fontSize: '0.85rem' }}
                  secondaryTypographyProps={{ fontSize: '0.7rem', fontFamily: 'monospace' }}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* 详细检查结果 */}
      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>详细检查结果</Typography>
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">危险关键词扫描</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {(report.details?.commandExecutionHits || []).length === 0 ? (
              <Typography variant="body2" color="text.secondary">未发现危险关键词</Typography>
            ) : (
              (report.details?.commandExecutionHits || []).map((h: any, i: number) => (
                <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', mb: 0.5 }}>
                  {h.type}: {h.pattern}
                </Typography>
              ))
            )}
          </AccordionDetails>
        </Accordion>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">文件操作与敏感路径</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {(report.details?.fileOperationHits || []).length === 0 ? (
              <Typography variant="body2" color="text.secondary">未发现异常文件操作</Typography>
            ) : (
              (report.details?.fileOperationHits || []).map((h: any, i: number) => (
                <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', mb: 0.5 }}>
                  {h.type}: {h.pattern}
                </Typography>
              ))
            )}
          </AccordionDetails>
        </Accordion>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">网络请求分析</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {(report.details?.networkRequestHits || []).length === 0 ? (
              <Typography variant="body2" color="text.secondary">未发现可疑网络请求</Typography>
            ) : (
              (report.details?.networkRequestHits || []).map((h: any, i: number) => (
                <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', mb: 0.5 }}>
                  {h.url || h.type}
                </Typography>
              ))
            )}
          </AccordionDetails>
        </Accordion>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">依赖安全分析</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {(report.details?.dependencyHits || []).length === 0 ? (
              <Typography variant="body2" color="text.secondary">未发现依赖风险</Typography>
            ) : (
              (report.details?.dependencyHits || []).map((h: any, i: number) => (
                <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', mb: 0.5 }}>
                  {h.package || h.type}
                </Typography>
              ))
            )}
          </AccordionDetails>
        </Accordion>
      </Paper>

      {/* 建议 */}
      {report.recommendations?.length > 0 && (
        <Paper sx={{ p: 3, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>安全建议</Typography>
          <List dense>
            {report.recommendations.map((r: string, i: number) => (
              <ListItem key={i}>
                <ListItemText primary={r} primaryTypographyProps={{ fontSize: '0.85rem' }} />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* 审查时间线 */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>审查历史</Typography>
        {history.length === 0 ? (
          <Typography variant="body2" color="text.secondary">暂无历史记录</Typography>
        ) : (
          <Stack spacing={1}>
            {history.map((h, i) => (
              <Box key={h.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                <Chip
                  label={AUDIT_LEVEL_LABELS[h.level]}
                  size="small"
                  sx={{ bgcolor: AUDIT_LEVEL_BG[h.level], color: AUDIT_LEVEL_COLORS[h.level], fontSize: '0.7rem' }}
                />
                <Typography variant="body2" sx={{ flex: 1 }}>
                  评分 {h.score} · 触发: {h.triggeredBy === 'import' ? '导入' : h.triggeredBy === 'manual' ? '手动' : '热重载'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(h.createdAt).toLocaleString()}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Paper>
    </Box>
    <Snackbar
      open={toast.open}
      autoHideDuration={4000}
      onClose={() => setToast({ ...toast, open: false })}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity={toast.severity} onClose={() => setToast({ ...toast, open: false })}>
        {toast.message}
      </Alert>
    </Snackbar>
    </>
  );
};

export default SkillAuditPage;
