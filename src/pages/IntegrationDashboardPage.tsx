/**
 * IntegrationDashboardPage — 集成模块监控面板
 *
 * 展示 5 个集成模块的激活状态与运行时状态：
 * - LLM 熔断器
 * - 通道熔断器
 * - 技能依赖检查
 * - 权限策略加载器
 * - 配置启动引导
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  Divider,
  useTheme,
  Tooltip,
  Collapse,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import MemoryIcon from '@mui/icons-material/Memory';
import HubIcon from '@mui/icons-material/Hub';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import ExtensionIcon from '@mui/icons-material/Extension';
import ReplayIcon from '@mui/icons-material/Replay';
import SyncIcon from '@mui/icons-material/Sync';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import {
  getIntegrationStatus,
  getLlmCircuitBreakers,
  resetLlmCircuitBreakers,
  getChannelCircuitBreakers,
  syncChannelCircuitBreakers,
  resetChannelCircuitBreakers,
  getLoadedPolicies,
  getPermissionTemplates,
} from '../services/insightsApi';
import type {
  IntegrationStatus,
  LlmCircuitBreaker,
  ChannelCircuitBreaker,
  PermissionPolicySummary,
  PermissionTemplate,
} from '../services/insightsApi';
import { getGrayScale } from '../constants/theme';

function formatTimestamp(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function CircuitStateChip({ state }: { state: 'closed' | 'open' | 'half-open' }) {
  const colorMap: Record<string, 'success' | 'error' | 'warning'> = {
    closed: 'success',
    open: 'error',
    'half-open': 'warning',
  };
  const labelMap: Record<string, string> = {
    closed: '已关闭',
    open: '已熔断',
    'half-open': '半开',
  };
  return <Chip size="small" color={colorMap[state]} label={labelMap[state]} />;
}

const IntegrationDashboardPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [llmBreakers, setLlmBreakers] = useState<LlmCircuitBreaker[]>([]);
  const [channelBreakers, setChannelBreakers] = useState<ChannelCircuitBreaker[]>([]);
  const [policies, setPolicies] = useState<PermissionPolicySummary[]>([]);
  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [expandedLlm, setExpandedLlm] = useState(true);
  const [expandedChannel, setExpandedChannel] = useState(true);
  const [expandedPermissions, setExpandedPermissions] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, llmRes, channelRes, policiesRes, templatesRes] = await Promise.all([
        getIntegrationStatus(),
        getLlmCircuitBreakers(),
        getChannelCircuitBreakers(),
        getLoadedPolicies(),
        getPermissionTemplates(),
      ]);
      setStatus(statusRes);
      setLlmBreakers(llmRes);
      setChannelBreakers(channelRes);
      setPolicies(policiesRes);
      setTemplates(templatesRes);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
    const interval = setInterval(loadAll, 30_000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const handleResetLlmBreakers = async () => {
    try {
      await resetLlmCircuitBreakers();
      void loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSyncChannelBreakers = async () => {
    try {
      await syncChannelCircuitBreakers();
      void loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleResetChannelBreakers = async () => {
    try {
      await resetChannelCircuitBreakers();
      void loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const moduleCards: Array<{
      title: string;
      icon: React.ReactNode;
      moduleKey: keyof IntegrationStatus;
      statusColor: 'default' | 'success' | 'error' | 'warning';
      summary: string;
    }> = status
    ? [
        {
          title: 'LLM 熔断器',
          icon: <MemoryIcon />,
          moduleKey: 'llmInvoker',
          statusColor:
            status.llmInvoker.openCircuits.length > 0
              ? 'error'
              : status.llmInvoker.registeredCircuitBreakers > 0
                ? 'success'
                : 'default',
          summary: `${status.llmInvoker.registeredCircuitBreakers} 个已注册，${status.llmInvoker.openCircuits.length} 个熔断`,
        },
        {
          title: '通道熔断器',
          icon: <HubIcon />,
          moduleKey: 'channelCircuitBreaker',
          statusColor:
            status.channelCircuitBreaker.openCircuits.length > 0
              ? 'error'
              : status.channelCircuitBreaker.boundToHealthMonitor
                ? 'success'
                : 'default',
          summary: `${status.channelCircuitBreaker.registeredBreakers} 个通道，${status.channelCircuitBreaker.openCircuits.length} 个熔断`,
        },
        {
          title: '技能依赖检查',
          icon: <ExtensionIcon />,
          moduleKey: 'skillDependencyChecker',
          statusColor: status.skillDependencyChecker.lastCheckSummary
            ? status.skillDependencyChecker.lastCheckSummary.failed > 0
              ? 'warning'
              : 'success'
            : 'default',
          summary: status.skillDependencyChecker.lastCheckSummary
            ? `${status.skillDependencyChecker.lastCheckSummary.total} 个技能，${status.skillDependencyChecker.lastCheckSummary.passed} 通过，${status.skillDependencyChecker.lastCheckSummary.failed} 失败`
            : '尚未检查',
        },
        {
          title: '权限策略加载器',
          icon: <SecurityIcon />,
          moduleKey: 'permissionPolicyLoader',
          statusColor: status.permissionPolicyLoader.loadedPolicies > 0 ? 'success' : 'default',
          summary: `${status.permissionPolicyLoader.loadedPolicies} 条策略已加载，${status.permissionPolicyLoader.availableTemplates} 种模板`,
        },
        {
          title: '配置启动引导',
          icon: <SettingsIcon />,
          moduleKey: 'configBootstrap',
          statusColor: status.configBootstrap.ready ? 'success' : 'default',
          summary: status.configBootstrap.ready ? '就绪' : '未就绪',
        },
      ]
    : [];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>
          集成模块监控
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {lastUpdate && (
            <Typography variant="caption" color="text.secondary">
              最后更新: {lastUpdate.toLocaleTimeString('zh-CN')}
            </Typography>
          )}
          <IconButton onClick={loadAll} disabled={loading}>
            {loading ? <CircularProgress size={20} /> : <RefreshIcon />}
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Module Status Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {moduleCards.map((card) => (
          <Grid item xs={12} sm={6} md={4} lg={2.4} key={card.moduleKey}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {card.icon}
                  <Typography variant="subtitle1" fontWeight={600}>
                    {card.title}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  color={card.statusColor}
                  label={card.statusColor === 'success' ? '运行中' : card.statusColor === 'error' ? '异常' : '就绪'}
                  sx={{ mb: 1 }}
                />
                <Typography variant="body2" color="text.secondary">
                  {card.summary}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* LLM Circuit Breakers Table */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => setExpandedLlm(!expandedLlm)}>
              <Typography variant="subtitle1" fontWeight={600}>
                LLM 熔断器 ({llmBreakers.length})
              </Typography>
              {expandedLlm ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </Box>
            <Button size="small" startIcon={<ReplayIcon />} onClick={handleResetLlmBreakers} disabled={llmBreakers.length === 0}>
              重置全部
            </Button>
          </Box>
          <Collapse in={expandedLlm}>
            {llmBreakers.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                暂无熔断器注册
              </Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Provider</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>失败次数</TableCell>
                      <TableCell>成功次数</TableCell>
                      <TableCell>最后失败</TableCell>
                      <TableCell>最后成功</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {llmBreakers.map((b) => (
                      <TableRow key={b.provider}>
                        <TableCell>{b.provider}</TableCell>
                        <TableCell>
                          <CircuitStateChip state={b.state} />
                        </TableCell>
                        <TableCell>{b.snapshot.failures}</TableCell>
                        <TableCell>{b.snapshot.successes}</TableCell>
                        <TableCell>{formatTimestamp(b.snapshot.lastFailure)}</TableCell>
                        <TableCell>{formatTimestamp(b.snapshot.lastSuccess)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Collapse>
        </CardContent>
      </Card>

      {/* Channel Circuit Breakers Table */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => setExpandedChannel(!expandedChannel)}>
              <Typography variant="subtitle1" fontWeight={600}>
                通道熔断器 ({channelBreakers.length})
              </Typography>
              {expandedChannel ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" startIcon={<SyncIcon />} onClick={handleSyncChannelBreakers}>
                同步健康度
              </Button>
              <Button size="small" startIcon={<ReplayIcon />} onClick={handleResetChannelBreakers} disabled={channelBreakers.length === 0}>
                重置全部
              </Button>
            </Box>
          </Box>
          <Collapse in={expandedChannel}>
            {channelBreakers.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                暂无通道熔断器注册（等待绑定到健康监控）
              </Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>通道 ID</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>失败次数</TableCell>
                      <TableCell>成功次数</TableCell>
                      <TableCell>健康状态</TableCell>
                      <TableCell>最后失败</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {channelBreakers.map((b) => (
                      <TableRow key={b.channelId}>
                        <TableCell>{b.channelId}</TableCell>
                        <TableCell>
                          <CircuitStateChip state={b.state} />
                        </TableCell>
                        <TableCell>{b.snapshot.failures}</TableCell>
                        <TableCell>{b.snapshot.successes}</TableCell>
                        <TableCell>{b.snapshot.lastHealthStatus ?? '-'}</TableCell>
                        <TableCell>{formatTimestamp(b.snapshot.lastFailure)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Collapse>
        </CardContent>
      </Card>

      {/* Permission Policies */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => setExpandedPermissions(!expandedPermissions)}>
              <Typography variant="subtitle1" fontWeight={600}>
                权限策略 ({policies.length}) / 模板 ({templates.length})
              </Typography>
              {expandedPermissions ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </Box>
          </Box>
          <Collapse in={expandedPermissions}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>
                  已加载策略
                </Typography>
                {policies.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    暂无策略加载
                  </Typography>
                ) : (
                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>Agent ID</TableCell>
                          <TableCell>允许</TableCell>
                          <TableCell>拒绝</TableCell>
                          <TableCell>需审批</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {policies.map((p) => (
                          <TableRow key={p.agentId}>
                            <TableCell>{p.agentId}</TableCell>
                            <TableCell>
                              <Typography variant="caption" sx={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>
                                {p.policy.allowed.slice(0, 3).join(', ')}
                                {p.policy.allowed.length > 3 && ` +${p.policy.allowed.length - 3}`}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption">
                                {p.policy.denied.length > 0 ? `${p.policy.denied.length} 项` : '-'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption">
                                {p.policy.requireApproval.length > 0 ? `${p.policy.requireApproval.length} 项` : '-'}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>
                  可用模板
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {templates.map((t) => (
                    <Chip key={t.name} label={t.name} variant="outlined" size="small" />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </Collapse>
        </CardContent>
      </Card>
    </Box>
  );
};

export default IntegrationDashboardPage;