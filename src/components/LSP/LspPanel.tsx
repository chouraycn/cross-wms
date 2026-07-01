/**
 * LspPanel — LSP 语言服务器状态面板
 *
 * 显示语言服务器列表、状态、配置、日志等。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  Collapse,
  Paper,
  Button,
  Divider,
  TextField,
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CodeIcon from '@mui/icons-material/Code';
import DescriptionIcon from '@mui/icons-material/Description';
import StorageIcon from '@mui/icons-material/Storage';
import {
  useTheme,
} from '@mui/material';
import { getGrayScale } from '../../constants/theme';
import type {
  LspServerConfig,
  LspServerInstance,
  LspServerStatus,
  LspStats,
  LspLogEntry,
  LspToolInfo,
} from '../../types/lsp';
import { LSP_TOOLS } from '../../types/lsp';

// ===================== 状态映射 =====================

const STATUS_ICON_MAP: Record<LspServerStatus, React.ReactNode> = {
  running: <CheckCircleOutlineIcon sx={{ fontSize: 16, color: '#22C55E' }} />,
  starting: <HourglassEmptyIcon sx={{ fontSize: 16, color: '#F59E0B' }} />,
  stopping: <HourglassEmptyIcon sx={{ fontSize: 16, color: '#F59E0B' }} />,
  stopped: <RemoveCircleOutlineIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />,
  error: <ErrorOutlineIcon sx={{ fontSize: 16, color: '#EF4444' }} />,
};

const STATUS_LABEL_MAP: Record<LspServerStatus, string> = {
  running: '运行中',
  starting: '启动中',
  stopping: '停止中',
  stopped: '已停止',
  error: '错误',
};

const STATUS_COLOR_MAP: Record<LspServerStatus, string> = {
  running: '#22C55E',
  starting: '#F59E0B',
  stopping: '#F59E0B',
  stopped: '#9CA3AF',
  error: '#EF4444',
};

// ===================== Mock 数据 =====================

const MOCK_SERVERS: LspServerConfig[] = [
  {
    id: 'typescript-language-server',
    name: 'TypeScript Language Server',
    language: 'typescript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    capabilities: [
      'completion',
      'definition',
      'hover',
      'references',
      'rename',
      'formatting',
      'diagnostics',
    ],
  },
  {
    id: 'pyright',
    name: 'Pyright',
    language: 'python',
    command: 'pyright-langserver',
    args: ['--stdio'],
    fileExtensions: ['.py', '.pyi', '.pyw'],
    capabilities: [
      'completion',
      'definition',
      'hover',
      'references',
      'rename',
      'diagnostics',
    ],
  },
  {
    id: 'gopls',
    name: 'Go Language Server',
    language: 'go',
    command: 'gopls',
    args: ['serve'],
    fileExtensions: ['.go', '.gomod', '.gowork'],
    capabilities: [
      'completion',
      'definition',
      'hover',
      'references',
      'rename',
      'formatting',
      'diagnostics',
    ],
  },
  {
    id: 'rust-analyzer',
    name: 'Rust Analyzer',
    language: 'rust',
    command: 'rust-analyzer',
    args: [],
    fileExtensions: ['.rs', '.toml'],
    capabilities: [
      'completion',
      'definition',
      'hover',
      'references',
      'rename',
      'formatting',
      'diagnostics',
    ],
  },
];

const MOCK_STATS: LspStats = {
  totalServers: 4,
  runningServers: 2,
  stoppedServers: 1,
  errorServers: 1,
  openDocuments: 15,
  totalRequests: 128,
  totalDiagnostics: 23,
  errorsBySeverity: {
    error: 3,
    warning: 8,
    info: 10,
    hint: 2,
  },
};

const MOCK_LOGS: LspLogEntry[] = [
  {
    timestamp: Date.now() - 1000,
    level: 'info',
    message: 'TypeScript Language Server 已启动',
    serverId: 'typescript-language-server',
  },
  {
    timestamp: Date.now() - 2000,
    level: 'info',
    message: 'Pyright 已启动',
    serverId: 'pyright',
  },
  {
    timestamp: Date.now() - 3000,
    level: 'error',
    message: 'rust-analyzer 启动失败: 未安装',
    serverId: 'rust-analyzer',
  },
  {
    timestamp: Date.now() - 4000,
    level: 'info',
    message: '处理代码补全请求',
    serverId: 'typescript-language-server',
    details: { file: 'src/index.ts', line: 10, character: 5 },
  },
];

// ===================== 服务器卡片 =====================

interface LspServerCardProps {
  server: LspServerConfig;
  instance?: LspServerInstance;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
}

const LspServerCard: React.FC<LspServerCardProps> = ({ server, instance, onStart, onStop }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [expanded, setExpanded] = useState(false);
  const [operating, setOperating] = useState(false);

  const status = instance?.status || 'stopped';
  const statusColor = STATUS_COLOR_MAP[status];

  const handleStart = async () => {
    setOperating(true);
    try {
      await onStart(server.id);
    } finally {
      setOperating(false);
    }
  };

  const handleStop = async () => {
    setOperating(true);
    try {
      await onStop(server.id);
    } finally {
      setOperating(false);
    }
  };

  return (
    <Card
      sx={{
        mb: 1.5,
        borderRadius: 2,
        border: `1px solid ${status === 'running' ? 'rgba(34,197,94,0.3)' : gs.border}`,
        backgroundColor: status === 'running'
          ? (isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.03)')
          : gs.bgPanel,
        transition: 'all 0.15s ease',
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {STATUS_ICON_MAP[status]}
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: gs.textPrimary, flex: 1 }}>
            {server.name}
          </Typography>
          <Chip
            label={STATUS_LABEL_MAP[status]}
            size="small"
            sx={{
              fontSize: '0.7rem',
              height: 22,
              backgroundColor: `${statusColor}20`,
              color: statusColor,
            }}
          />
          {instance?.pid && (
            <Chip
              label={`PID: ${instance.pid}`}
              size="small"
              sx={{
                fontSize: '0.7rem',
                height: 22,
                backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)',
                color: 'rgba(99,102,241,1)',
              }}
            />
          )}
          {instance?.serverInfo?.version && (
            <Chip
              label={`v${instance.serverInfo.version}`}
              size="small"
              sx={{
                fontSize: '0.7rem',
                height: 22,
                backgroundColor: gs.bgHover,
                color: gs.textMuted,
              }}
            />
          )}
          {/* 启动/停止按钮 */}
          {status === 'stopped' && (
            <Tooltip title="启动">
              <IconButton size="small" onClick={handleStart} disabled={operating} sx={{ color: '#22C55E' }}>
                <PlayArrowIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
          {status === 'running' && (
            <Tooltip title="停止">
              <IconButton size="small" onClick={handleStop} disabled={operating} sx={{ color: '#EF4444' }}>
                <StopIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
          {/* 展开按钮 */}
          <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ color: gs.textMuted }}>
            {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </Box>

        {/* 命令行 */}
        <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mt: 0.75, fontFamily: 'monospace' }}>
          {server.command} {server.args?.join(' ') || ''}
        </Typography>

        {/* 错误信息 */}
        {instance?.errorMessage && (
          <Typography sx={{ fontSize: '0.78rem', color: '#EF4444', mt: 0.5 }}>
            {instance.errorMessage}
          </Typography>
        )}

        {/* 详情（展开） */}
        <Collapse in={expanded}>
          <Box sx={{ mt: 1.5 }}>
            <Divider sx={{ mb: 1.5 }} />
            {/* 统计信息 */}
            {instance && (
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                    总请求: {instance.totalRequests}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                    错误次数: {instance.errorCount}
                  </Typography>
                </Grid>
                {instance.startedAt && (
                  <Grid item xs={12}>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                      启动时间: {new Date(instance.startedAt).toLocaleString()}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            )}
            {/* 支持的能力 */}
            {server.capabilities && server.capabilities.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: gs.textPrimary, mb: 0.5 }}>
                  支持能力:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {server.capabilities.map(cap => (
                    <Chip
                      key={cap}
                      label={cap}
                      size="small"
                      sx={{
                        fontSize: '0.65rem',
                        height: 20,
                        backgroundColor: isDark ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.05)',
                        color: 'rgba(99,102,241,0.8)',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
            {/* 文件扩展名 */}
            <Box sx={{ mt: 1 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: gs.textPrimary, mb: 0.5 }}>
                文件类型:
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {server.fileExtensions.map(ext => (
                  <Chip
                    key={ext}
                    label={ext}
                    size="small"
                    sx={{
                      fontSize: '0.65rem',
                      height: 20,
                      backgroundColor: gs.bgHover,
                      color: gs.textMuted,
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
};

// ===================== 工具列表卡片 =====================

const LspToolsPanel: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  return (
    <Paper sx={{ p: 2, borderRadius: 2, backgroundColor: gs.bgPanel, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <CodeIcon sx={{ fontSize: 18, color: gs.textSecondary }} />
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
          LSP 工具 (7)
        </Typography>
      </Box>
      <Grid container spacing={1}>
        {LSP_TOOLS.map(tool => (
          <Grid item xs={6} key={tool.name}>
            <Box
              sx={{
                p: 1,
                borderRadius: 1.5,
                backgroundColor: gs.bgHover,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography sx={{ fontSize: '1rem' }}>{tool.icon}</Typography>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: gs.textPrimary }}>
                  {tool.displayName}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
                  {tool.description.slice(0, 30)}...
                </Typography>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
};

// ===================== 统计信息面板 =====================

const LspStatsPanel: React.FC<{ stats: LspStats }> = ({ stats }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  return (
    <Paper sx={{ p: 2, borderRadius: 2, backgroundColor: gs.bgPanel, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <StorageIcon sx={{ fontSize: 18, color: gs.textSecondary }} />
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
          统计信息
        </Typography>
      </Box>
      <Grid container spacing={2}>
        <Grid item xs={4}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: '#22C55E' }}>
              {stats.runningServers}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
              运行中
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={4}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: gs.textPrimary }}>
              {stats.openDocuments}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
              打开文档
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={4}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: gs.textPrimary }}>
              {stats.totalRequests}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
              总请求
            </Typography>
          </Box>
        </Grid>
      </Grid>
      {/* 错误统计 */}
      <Box sx={{ mt: 1.5 }}>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: gs.textPrimary, mb: 0.5 }}>
          诊断统计:
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip label={`错误: ${stats.errorsBySeverity.error}`} size="small" sx={{ fontSize: '0.7rem', height: 20, backgroundColor: '#EF444420', color: '#EF4444' }} />
          <Chip label={`警告: ${stats.errorsBySeverity.warning}`} size="small" sx={{ fontSize: '0.7rem', height: 20, backgroundColor: '#F59E0B20', color: '#F59E0B' }} />
          <Chip label={`信息: ${stats.errorsBySeverity.info}`} size="small" sx={{ fontSize: '0.7rem', height: 20, backgroundColor: '#3B82F620', color: '#3B82F6' }} />
          <Chip label={`提示: ${stats.errorsBySeverity.hint}`} size="small" sx={{ fontSize: '0.7rem', height: 20, backgroundColor: '#9CA3AF20', color: '#9CA3AF' }} />
        </Box>
      </Box>
    </Paper>
  );
};

// ===================== 日志面板 =====================

const LspLogPanel: React.FC<{ logs: LspLogEntry[] }> = ({ logs }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  return (
    <Paper sx={{ p: 2, borderRadius: 2, backgroundColor: gs.bgPanel }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <DescriptionIcon sx={{ fontSize: 18, color: gs.textSecondary }} />
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
          日志
        </Typography>
      </Box>
      <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
        {logs.map((log, idx) => (
          <Box
            key={idx}
            sx={{
              p: 0.75,
              mb: 0.5,
              borderRadius: 1,
              backgroundColor: gs.bgHover,
              borderLeft: `3px solid ${
                log.level === 'error' ? '#EF4444'
                : log.level === 'warn' ? '#F59E0B'
                : log.level === 'info' ? '#3B82F6'
                : '#9CA3AF'
              }`,
            }}
          >
            <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, fontFamily: 'monospace' }}>
              {new Date(log.timestamp).toLocaleTimeString()}
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', color: gs.textPrimary }}>
              {log.message}
            </Typography>
            {log.serverId && (
              <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
                [{log.serverId}]
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Paper>
  );
};

// ===================== 主面板 =====================

const LspPanel: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [servers, setServers] = useState<LspServerConfig[]>(MOCK_SERVERS);
  const [instances, setInstances] = useState<Map<string, LspServerInstance>>(new Map());
  const [stats, setStats] = useState<LspStats>(MOCK_STATS);
  const [logs, setLogs] = useState<LspLogEntry[]>(MOCK_LOGS);

  // 模拟启动服务器
  const handleStart = useCallback(async (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server) return;

    // 模拟启动过程
    setInstances(prev => {
      const newMap = new Map(prev);
      newMap.set(serverId, {
        id: serverId,
        config: server,
        status: 'starting',
        totalRequests: 0,
        activeRequests: 0,
        errorCount: 0,
      });
      return newMap;
    });

    // 添加日志
    setLogs(prev => [
      {
        timestamp: Date.now(),
        level: 'info',
        message: `正在启动 ${server.name}...`,
        serverId,
      },
      ...prev,
    ]);

    // 模拟延迟
    await new Promise(resolve => setTimeout(resolve, 500));

    // 更新为运行状态
    setInstances(prev => {
      const newMap = new Map(prev);
      const instance = newMap.get(serverId);
      if (instance) {
        newMap.set(serverId, {
          ...instance,
          status: 'running',
          pid: Math.floor(Math.random() * 50000) + 1000,
          startedAt: Date.now(),
          serverInfo: {
            name: server.name,
            version: '1.0.0',
          },
        });
      }
      return newMap;
    });

    // 更新统计
    setStats(prev => ({
      ...prev,
      runningServers: prev.runningServers + 1,
      stoppedServers: prev.stoppedServers - 1,
    }));

    // 添加日志
    setLogs(prev => [
      {
        timestamp: Date.now(),
        level: 'info',
        message: `${server.name} 已启动`,
        serverId,
      },
      ...prev,
    ]);
  }, [servers]);

  // 模拟停止服务器
  const handleStop = useCallback(async (serverId: string) => {
    const instance = instances.get(serverId);
    if (!instance) return;

    // 添加日志
    setLogs(prev => [
      {
        timestamp: Date.now(),
        level: 'info',
        message: `正在停止 ${instance.config.name}...`,
        serverId,
      },
      ...prev,
    ]);

    // 模拟延迟
    await new Promise(resolve => setTimeout(resolve, 300));

    // 更新为停止状态
    setInstances(prev => {
      const newMap = new Map(prev);
      newMap.delete(serverId);
      return newMap;
    });

    // 更新统计
    setStats(prev => ({
      ...prev,
      runningServers: prev.runningServers - 1,
      stoppedServers: prev.stoppedServers + 1,
    }));

    // 添加日志
    setLogs(prev => [
      {
        timestamp: Date.now(),
        level: 'info',
        message: `${instance.config.name} 已停止`,
        serverId,
      },
      ...prev,
    ]);
  }, [instances]);

  const handleRefresh = useCallback(() => {
    // 模拟刷新
    setLogs(prev => [
      {
        timestamp: Date.now(),
        level: 'info',
        message: '刷新 LSP 服务器状态',
      },
      ...prev.slice(0, 50),
    ]);
  }, []);

  // 初始化模拟数据
  useEffect(() => {
    // 模拟已有运行的服务器
    const runningServers = ['typescript-language-server', 'pyright'];
    runningServers.forEach(serverId => {
      const server = servers.find(s => s.id === serverId);
      if (server) {
        setInstances(prev => {
          const newMap = new Map(prev);
          newMap.set(serverId, {
            id: serverId,
            config: server,
            status: 'running',
            pid: Math.floor(Math.random() * 50000) + 1000,
            startedAt: Date.now() - 10000,
            totalRequests: Math.floor(Math.random() * 100),
            activeRequests: 0,
            errorCount: 0,
            serverInfo: {
              name: server.name,
              version: '1.0.0',
            },
          });
          return newMap;
        });
      }
    });
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 工具栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary, flex: 1 }}>
          LSP 语言服务器
        </Typography>
        <Button
          size="small"
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          sx={{
            fontSize: '0.78rem',
            color: gs.textSecondary,
          }}
        >
          刷新
        </Button>
      </Box>

      {/* 说明 */}
      <Typography sx={{ fontSize: '0.78rem', color: gs.textSecondary, mb: 2 }}>
        LSP (Language Server Protocol) 提供代码补全、诊断、跳转定义等智能编辑能力。
      </Typography>

      {/* 主内容区 */}
      <Grid container spacing={2} sx={{ flex: 1, overflow: 'auto' }}>
        {/* 左侧：服务器列表 */}
        <Grid item xs={8}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
            语言服务器 ({servers.length})
          </Typography>
          {servers.map(server => (
            <LspServerCard
              key={server.id}
              server={server}
              instance={instances.get(server.id)}
              onStart={handleStart}
              onStop={handleStop}
            />
          ))}
        </Grid>

        {/* 右侧：统计、工具、日志 */}
        <Grid item xs={4}>
          <LspStatsPanel stats={stats} />
          <LspToolsPanel />
          <LspLogPanel logs={logs.slice(0, 20)} />
        </Grid>
      </Grid>
    </Box>
  );
};

export default LspPanel;