import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, CircularProgress,
  useTheme, Alert, Divider, Stack,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import RotateCcwIcon from '@mui/icons-material/RotateLeft';
import AlertTriangleIcon from '@mui/icons-material/WarningAmber';
import ShieldIcon from '@mui/icons-material/Shield';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import type { ContextEngineInfo, ContextEngineStats } from '../services/api';
import {
  fetchContextEngines, fetchContextEngineStats,
  activateContextEngine, deactivateContextEngine,
  quarantineContextEngine, recoverContextEngine, refreshContextEngine,
} from '../services/api';

const HEALTH_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  healthy: { bg: '#D1FAE5', text: '#059669', label: '健康' },
  degraded: { bg: '#FEF3C7', text: '#D97706', label: '降级' },
  unhealthy: { bg: '#FEE2E2', text: '#DC2626', label: '不健康' },
  quarantined: { bg: '#F3E8FF', text: '#7C3AED', label: '已隔离' },
  unknown: { bg: '#F3F4F6', text: '#6B7280', label: '未知' },
};

const OWNER_COLORS: Record<string, string> = {
  core: '#22C55E',
  'public-sdk': '#3B82F6',
};

function HealthChip({ health }: { health: ContextEngineInfo['health'] }) {
  const cfg = HEALTH_COLORS[health.status] || HEALTH_COLORS.unknown;
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

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number | string; color: string; icon?: React.ElementType }) {
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
      {Icon && <Icon sx={{ fontSize: '1.2rem', color, mb: 1 }} />}
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</Typography>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>{label}</Typography>
    </Paper>
  );
}

const ContextEngineRegistryPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [engines, setEngines] = useState<ContextEngineInfo[]>([]);
  const [stats, setStats] = useState<ContextEngineStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [enginesRes, statsRes] = await Promise.all([
        fetchContextEngines(),
        fetchContextEngineStats(),
      ]);
      setEngines(enginesRes);
      setStats(statsRes);
    } catch (e) {
      showToast(`加载失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAction = async (id: string, action: 'activate' | 'deactivate' | 'quarantine' | 'recover' | 'refresh') => {
    setActionLoading(id);
    try {
      let success = false;
      switch (action) {
        case 'activate':
          success = (await activateContextEngine(id)).success;
          break;
        case 'deactivate':
          success = (await deactivateContextEngine(id)).success;
          break;
        case 'quarantine':
          success = (await quarantineContextEngine(id)).success;
          break;
        case 'recover':
          success = (await recoverContextEngine(id)).success;
          break;
        case 'refresh':
          success = (await refreshContextEngine(id)).success;
          break;
      }
      if (success) {
        showToast('操作成功', 'success');
        loadData();
      }
    } catch (e) {
      showToast(`操作失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
          上下文引擎注册表
        </Typography>
        <IconButton size="small" onClick={loadData} disabled={loading}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {stats && (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <StatCard label="引擎总数" value={stats.totalEngines} color={gs.textPrimary} icon={InfoIcon} />
          <StatCard label="活跃引擎" value={stats.activeEngines} color="#22C55E" icon={CheckCircleIcon} />
          <StatCard label="隔离引擎" value={stats.quarantinedEngines} color="#7C3AED" icon={ShieldIcon} />
          <StatCard label="总操作数" value={stats.totalOperations} color="#3B82F6" />
          <StatCard label="平均延迟" value={`${stats.avgLatencyMs}ms`} color="#F59E0B" />
        </Box>
      )}

      <Divider sx={{ my: 1 }} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={24} />
        </Box>
      ) : engines.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          暂无上下文引擎注册
        </Alert>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>引擎 ID</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>名称</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>所有者</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>健康状态</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>默认</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>配置</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {engines.map((engine) => (
                <TableRow key={engine.id} sx={{ '&:hover': { backgroundColor: gs.bgHover } }}>
                  <TableCell>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{engine.id}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: '0.85rem' }}>
                      {engine.config.name || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={engine.owner}
                      size="small"
                      sx={{
                        fontSize: '0.65rem',
                        height: 20,
                        backgroundColor: (OWNER_COLORS[engine.owner] || gs.textMuted) + '22',
                        color: OWNER_COLORS[engine.owner] || gs.textPrimary,
                        fontWeight: 600,
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <HealthChip health={engine.health} />
                      {engine.health.quarantineReason && (
                        <Tooltip title={`隔离原因: ${engine.health.quarantineReason}`}>
                          <AlertTriangleIcon sx={{ fontSize: 14, color: '#7C3AED' }} />
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {engine.isDefault ? (
                      <Chip label="默认" size="small" sx={{ fontSize: '0.65rem', height: 20, backgroundColor: '#22C55E22', color: '#22C55E', fontWeight: 600 }} />
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.5}>
                      {engine.config.maxMemoryBudget && (
                        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                          内存预算: {engine.config.maxMemoryBudget}
                        </Typography>
                      )}
                      <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                        增强搜索: {engine.config.enableEnhancedSearch ? '开启' : '关闭'}
                      </Typography>
                      <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                        记忆同步: {engine.config.enableMemorySyncer ? '开启' : '关闭'}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="激活">
                        <IconButton
                          size="small"
                          onClick={() => handleAction(engine.id, 'activate')}
                          disabled={actionLoading === engine.id}
                        >
                          <PlayArrowIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="停用">
                        <IconButton
                          size="small"
                          onClick={() => handleAction(engine.id, 'deactivate')}
                          disabled={actionLoading === engine.id}
                        >
                          <PauseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="隔离">
                        <IconButton
                          size="small"
                          onClick={() => handleAction(engine.id, 'quarantine')}
                          disabled={actionLoading === engine.id}
                        >
                          <ShieldIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="恢复">
                        <IconButton
                          size="small"
                          onClick={() => handleAction(engine.id, 'recover')}
                          disabled={actionLoading === engine.id}
                        >
                          <RotateCcwIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="刷新">
                        <IconButton
                          size="small"
                          onClick={() => handleAction(engine.id, 'refresh')}
                          disabled={actionLoading === engine.id}
                        >
                          <RefreshIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default ContextEngineRegistryPage;