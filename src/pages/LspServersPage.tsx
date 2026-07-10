/**
 * LspServersPage — LSP 服务器管理面板
 *
 * 提供 LSP 服务器的管理、监控和测试功能
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  TextField,
  Chip,
  Alert,
  LinearProgress,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Collapse,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DescriptionIcon from '@mui/icons-material/Description';
import TerminalIcon from '@mui/icons-material/Terminal';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import CodeIcon from '@mui/icons-material/Code';
import InfoIcon from '@mui/icons-material/Info';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import DNSIcon from '@mui/icons-material/Dns';

import * as lspApi from '../services/lspApi';
import { getGrayScale } from '../constants/theme';

const LspServersPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 状态管理
  const [servers, setServers] = useState<lspApi.LSPServer[]>([]);
  const [healthStatus, setHealthStatus] = useState<lspApi.LSPHealthStatus | null>(null);
  const [selectedServer, setSelectedServer] = useState<lspApi.LSPServer | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 日志对话框
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);

  // 补全测试
  const [completionServerId, setCompletionServerId] = useState('');
  const [completionFilePath, setCompletionFilePath] = useState('');
  const [completionLine, setCompletionLine] = useState(1);
  const [completionColumn, setCompletionColumn] = useState(1);
  const [completions, setCompletions] = useState<lspApi.LSPCompletionItem[]>([]);
  const [completionLoading, setCompletionLoading] = useState(false);

  // 悬停测试
  const [hoverServerId, setHoverServerId] = useState('');
  const [hoverFilePath, setHoverFilePath] = useState('');
  const [hoverLine, setHoverLine] = useState(1);
  const [hoverColumn, setHoverColumn] = useState(1);
  const [hoverResult, setHoverResult] = useState<lspApi.LSPHover | null>(null);
  const [hoverLoading, setHoverLoading] = useState(false);

  // 加载服务器列表
  const loadServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lspApi.getLSPServers();
      setServers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载服务器列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载健康状态
  const loadHealthStatus = useCallback(async () => {
    setHealthLoading(true);
    try {
      const status = await lspApi.getLSPHealth();
      setHealthStatus(status);
    } catch (e) {
      console.error('加载健康状态失败:', e);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // 页面加载时获取数据
  useEffect(() => {
    loadServers();
    loadHealthStatus();
  }, [loadServers, loadHealthStatus]);

  // 启动服务器
  const handleStartServer = useCallback(async (serverId: string) => {
    setError(null);
    try {
      const result = await lspApi.startLSPServer(serverId);
      if (result.ok) {
        setNotice(`服务器 ${serverId} 启动成功${result.pid ? ` (PID: ${result.pid})` : ''}`);
        await loadServers();
        await loadHealthStatus();
      } else {
        setError(`启动失败: ${result.error || '未知错误'}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动服务器失败');
    }
  }, [loadServers, loadHealthStatus]);

  // 停止服务器
  const handleStopServer = useCallback(async (serverId: string) => {
    setError(null);
    try {
      const result = await lspApi.stopLSPServer(serverId);
      if (result.ok) {
        setNotice(`服务器 ${serverId} 已停止`);
        await loadServers();
        await loadHealthStatus();
      } else {
        setError(`停止失败: ${result.error || '未知错误'}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '停止服务器失败');
    }
  }, [loadServers, loadHealthStatus]);

  // 查看日志
  const handleViewLogs = useCallback(async (server: lspApi.LSPServer) => {
    setSelectedServer(server);
    setLogsDialogOpen(true);
    setLogsLoading(true);
    setLogs([]);
    try {
      const result = await lspApi.getLSPLogs(server.id);
      if (result.ok) {
        setLogs(result.logs);
      } else {
        setError(`获取日志失败: ${result.error || '未知错误'}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取日志失败');
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // 测试补全
  const handleTestCompletion = useCallback(async () => {
    if (!completionServerId || !completionFilePath) {
      setError('请填写服务器ID和文件路径');
      return;
    }
    setCompletionLoading(true);
    setError(null);
    try {
      const result = await lspApi.getLSPCompletions(
        completionServerId,
        completionFilePath,
        completionLine,
        completionColumn
      );
      if (result.ok) {
        setCompletions(result.completions);
        if (result.completions.length === 0) {
          setNotice('未找到补全建议');
        }
      } else {
        setError(`补全失败: ${result.error || '未知错误'}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '补全请求失败');
    } finally {
      setCompletionLoading(false);
    }
  }, [completionServerId, completionFilePath, completionLine, completionColumn]);

  // 测试悬停
  const handleTestHover = useCallback(async () => {
    if (!hoverServerId || !hoverFilePath) {
      setError('请填写服务器ID和文件路径');
      return;
    }
    setHoverLoading(true);
    setError(null);
    try {
      const result = await lspApi.getLSPHover(
        hoverServerId,
        hoverFilePath,
        hoverLine,
        hoverColumn
      );
      if (result.ok) {
        setHoverResult(result.hover);
        if (!result.hover) {
          setNotice('未找到悬停信息');
        }
      } else {
        setError(`获取悬停信息失败: ${result.error || '未知错误'}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '悬停请求失败');
    } finally {
      setHoverLoading(false);
    }
  }, [hoverServerId, hoverFilePath, hoverLine, hoverColumn]);

  // 获取服务器状态颜色
  const getServerStatusColor = (server: lspApi.LSPServer) => {
    if (server.running) return 'success';
    if (server.initialized) return 'info';
    return 'default';
  };

  // 获取服务器状态文本
  const getServerStatusText = (server: lspApi.LSPServer) => {
    if (server.running) return '运行中';
    if (server.initialized) return '已初始化';
    return '已停止';
  };

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* 标题与操作 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TerminalIcon color="primary" />
          <Typography variant="h4" fontWeight={600}>
            LSP 服务器管理
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => {
            loadServers();
            loadHealthStatus();
          }}
          disabled={loading}
        >
          刷新
        </Button>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {/* 健康状态卡片 */}
      <Card sx={{ mb: 3, bgcolor: gs.bgPanel, borderColor: gs.border }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <HealthAndSafetyIcon fontSize="small" />
            <Typography variant="h6" fontWeight={600}>
              服务健康状态
            </Typography>
            {healthStatus && (
              <Chip
                label={healthStatus.ok ? '正常' : '异常'}
                color={healthStatus.ok ? 'success' : 'error'}
                size="small"
                sx={{ ml: 1 }}
              />
            )}
          </Box>

          {healthStatus ? (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Card variant="outlined" sx={{ bgcolor: gs.bgHover }}>
                  <CardContent>
                    <Typography variant="body2" color={gs.textSecondary}>
                      已注册
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {healthStatus.stats.registered}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card variant="outlined" sx={{ bgcolor: gs.bgHover }}>
                  <CardContent>
                    <Typography variant="body2" color={gs.textSecondary}>
                      运行中
                    </Typography>
                    <Typography variant="h4" fontWeight={600} color="success.main">
                      {healthStatus.stats.running}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card variant="outlined" sx={{ bgcolor: gs.bgHover }}>
                  <CardContent>
                    <Typography variant="body2" color={gs.textSecondary}>
                      已初始化
                    </Typography>
                    <Typography variant="h4" fontWeight={600} color="info.main">
                      {healthStatus.stats.initialized}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          ) : (
            <Typography color={gs.textMuted}>
              {healthLoading ? '加载中…' : '暂无健康状态数据'}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* 服务器列表 */}
      <Card sx={{ mb: 3, bgcolor: gs.bgPanel, borderColor: gs.border }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <DNSIcon fontSize="small" />
            <Typography variant="h6" fontWeight={600}>
              服务器列表
            </Typography>
            <Chip label={servers.length} size="small" sx={{ ml: 1 }} />
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: gs.bgHover }}>
                  <TableCell>名称</TableCell>
                  <TableCell>命令</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell align="right">PID</TableCell>
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {servers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: gs.textMuted }}>
                      暂无服务器数据
                    </TableCell>
                  </TableRow>
                ) : (
                  servers.map((server) => (
                    <TableRow key={server.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {server.name}
                        </Typography>
                        <Typography variant="caption" color={gs.textMuted}>
                          {server.id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          {server.command}
                          {server.args && server.args.length > 0 && ` ${server.args.join(' ')}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getServerStatusText(server)}
                          color={getServerStatusColor(server)}
                          size="small"
                          icon={server.running ? <CheckCircleIcon /> : <CancelIcon />}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {server.pid || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          {server.running ? (
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleStopServer(server.id)}
                              title="停止服务器"
                            >
                              <StopIcon fontSize="small" />
                            </IconButton>
                          ) : (
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => handleStartServer(server.id)}
                              title="启动服务器"
                            >
                              <PlayArrowIcon fontSize="small" />
                            </IconButton>
                          )}
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleViewLogs(server)}
                            title="查看日志"
                          >
                            <DescriptionIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* 测试功能区域 */}
      <Grid container spacing={3}>
        {/* 补全测试 */}
        <Grid item xs={12} md={6}>
          <Card sx={{ bgcolor: gs.bgPanel, borderColor: gs.border, height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CodeIcon fontSize="small" />
                <Typography variant="h6" fontWeight={600}>
                  补全测试
                </Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    size="small"
                    label="服务器 ID"
                    value={completionServerId}
                    onChange={(e) => setCompletionServerId(e.target.value)}
                    placeholder="例如: typescript-language-server"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    size="small"
                    label="文件路径"
                    value={completionFilePath}
                    onChange={(e) => setCompletionFilePath(e.target.value)}
                    placeholder="/path/to/file.ts"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="行号"
                    value={completionLine}
                    onChange={(e) => setCompletionLine(Number(e.target.value))}
                    inputProps={{ min: 1 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="列号"
                    value={completionColumn}
                    onChange={(e) => setCompletionColumn(Number(e.target.value))}
                    inputProps={{ min: 1 }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button
                    variant="contained"
                    startIcon={completionLoading ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                    onClick={handleTestCompletion}
                    disabled={completionLoading}
                    fullWidth
                  >
                    测试补全
                  </Button>
                </Grid>
              </Grid>

              <Collapse in={completions.length > 0}>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    补全建议 ({completions.length})
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: gs.bgHover }}>
                          <TableCell>标签</TableCell>
                          <TableCell>类型</TableCell>
                          <TableCell>详情</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {completions.slice(0, 20).map((item, idx) => (
                          <TableRow key={idx} hover>
                            <TableCell>
                              <Chip label={item.label} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>{item.kind}</TableCell>
                            <TableCell>
                              <Typography variant="caption" color={gs.textMuted}>
                                {item.detail || '-'}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {completions.length > 20 && (
                    <Typography variant="caption" color={gs.textMuted} sx={{ mt: 1, display: 'block' }}>
                      仅显示前 20 条，共 {completions.length} 条
                    </Typography>
                  )}
                </Box>
              </Collapse>
            </CardContent>
          </Card>
        </Grid>

        {/* 悬停测试 */}
        <Grid item xs={12} md={6}>
          <Card sx={{ bgcolor: gs.bgPanel, borderColor: gs.border, height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <InfoIcon fontSize="small" />
                <Typography variant="h6" fontWeight={600}>
                  悬停测试
                </Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    size="small"
                    label="服务器 ID"
                    value={hoverServerId}
                    onChange={(e) => setHoverServerId(e.target.value)}
                    placeholder="例如: typescript-language-server"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    size="small"
                    label="文件路径"
                    value={hoverFilePath}
                    onChange={(e) => setHoverFilePath(e.target.value)}
                    placeholder="/path/to/file.ts"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="行号"
                    value={hoverLine}
                    onChange={(e) => setHoverLine(Number(e.target.value))}
                    inputProps={{ min: 1 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="列号"
                    value={hoverColumn}
                    onChange={(e) => setHoverColumn(Number(e.target.value))}
                    inputProps={{ min: 1 }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button
                    variant="contained"
                    startIcon={hoverLoading ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                    onClick={handleTestHover}
                    disabled={hoverLoading}
                    fullWidth
                  >
                    测试悬停
                  </Button>
                </Grid>
              </Grid>

              <Collapse in={hoverResult !== null}>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    悬停信息
                  </Typography>
                  <Card variant="outlined" sx={{ bgcolor: gs.bgHover }}>
                    <CardContent>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                        {hoverResult?.content || '无内容'}
                      </Typography>
                      {hoverResult?.range && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption" color={gs.textMuted}>
                            范围: 行 {hoverResult.range.start.line + 1}, 列 {hoverResult.range.start.character + 1} -{' '}
                            行 {hoverResult.range.end.line + 1}, 列 {hoverResult.range.end.character + 1}
                          </Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Box>
              </Collapse>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 日志对话框 */}
      <Dialog
        open={logsDialogOpen}
        onClose={() => setLogsDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DescriptionIcon fontSize="small" />
            <Typography variant="h6">
              服务器日志 - {selectedServer?.name}
            </Typography>
            {selectedServer && (
              <Chip
                label={getServerStatusText(selectedServer)}
                color={getServerStatusColor(selectedServer)}
                size="small"
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {logsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : logs.length === 0 ? (
            <Typography color={gs.textMuted} align="center" sx={{ py: 4 }}>
              暂无日志数据
            </Typography>
          ) : (
            <Box
              sx={{
                bgcolor: gs.bgHover,
                p: 2,
                borderRadius: 1,
                maxHeight: '60vh',
                overflow: 'auto',
              }}
            >
              {logs.map((log, idx) => (
                <Typography
                  key={idx}
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    mb: 0.5,
                    color: gs.textPrimary,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {log}
                </Typography>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogsDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LspServersPage;