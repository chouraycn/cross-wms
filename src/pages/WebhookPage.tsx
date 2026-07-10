/**
 * WebhookPage — Webhook 管理页面
 *
 * 提供 Webhook 的 CRUD 操作、测试功能和日志查询
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PendingIcon from '@mui/icons-material/Pending';
import WebhookIcon from '@mui/icons-material/Webhook';

import {
  getAllWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getWebhookStats,
  testWebhook,
  getWebhookLogs,
  type WebhookConfig,
  type WebhookLog,
  type WebhookStats,
} from '../services/webhookApi';

const AVAILABLE_EVENTS = [
  'inventory.created',
  'inventory.updated',
  'inventory.deleted',
  'transit.order.created',
  'transit.order.updated',
  'inbound.created',
  'outbound.created',
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

const WebhookPage: React.FC = () => {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openDialog, setOpenDialog] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    events: [] as string[],
    headers: '',
    enabled: true,
  });

  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [openLogsDialog, setOpenLogsDialog] = useState(false);
  const [logsWebhookId, setLogsWebhookId] = useState<string | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(0);
  const logsPerPage = 20;

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [webhooksData, statsData] = await Promise.all([
        getAllWebhooks(),
        getWebhookStats(),
      ]);
      setWebhooks(webhooksData);
      setStats(statsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenDialog = (webhook?: WebhookConfig) => {
    if (webhook) {
      setEditingWebhook(webhook);
      setFormData({
        name: webhook.name,
        url: webhook.url,
        events: [...webhook.events],
        headers: JSON.stringify(webhook.headers, null, 2),
        enabled: webhook.enabled,
      });
    } else {
      setEditingWebhook(null);
      setFormData({
        name: '',
        url: '',
        events: [],
        headers: '{\n}',
        enabled: true,
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingWebhook(null);
    setFormData({
      name: '',
      url: '',
      events: [],
      headers: '{\n}',
      enabled: true,
    });
  };

  const handleSave = async () => {
    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(formData.headers);
    } catch {
      setError('headers 格式不正确');
      return;
    }

    try {
      if (editingWebhook) {
        await updateWebhook(editingWebhook.id, {
          name: formData.name,
          url: formData.url,
          events: formData.events,
          headers,
          enabled: formData.enabled,
        });
      } else {
        await createWebhook({
          name: formData.name,
          url: formData.url,
          events: formData.events,
          headers,
          enabled: formData.enabled,
        });
      }
      handleCloseDialog();
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteWebhook(deleteId);
      setOpenDeleteDialog(false);
      setDeleteId(null);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await testWebhook(id);
      setTestResult({
        success: result.ok,
        message: result.ok
          ? `状态码: ${result.response?.status}\n响应: ${result.response?.body}`
          : result.error || '测试失败',
      });
    } catch (e) {
      setTestResult({
        success: false,
        message: e instanceof Error ? e.message : '测试失败',
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleOpenLogs = async (id: string) => {
    setLogsWebhookId(id);
    setLogsPage(0);
    setLogsLoading(true);
    setOpenLogsDialog(true);
    try {
      const { logs: logsData, total } = await getWebhookLogs(id, logsPerPage, 0);
      setLogs(logsData);
      setLogsTotal(total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLogsLoading(false);
    }
  };

  const handleLogsPageChange = async (page: number) => {
    if (!logsWebhookId) return;
    setLogsLoading(true);
    try {
      const { logs: logsData, total } = await getWebhookLogs(logsWebhookId, logsPerPage, page * logsPerPage);
      setLogs(logsData);
      setLogsTotal(total);
      setLogsPage(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLogsLoading(false);
    }
  };

  const handleEventToggle = (event: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <WebhookIcon sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h4" fontWeight={600}>
              Webhook 管理
            </Typography>
            <Typography variant="caption" color="text.secondary">
              配置和管理系统事件通知
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {loading && <CircularProgress size={24} />}
          <IconButton onClick={loadData} disabled={loading}>
            <RefreshIcon />
          </IconButton>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            创建 Webhook
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <WebhookIcon color="primary" />
                <Typography variant="body2" color="text.secondary">
                  总 Webhook
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats?.total ?? '-'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircleIcon color="success" />
                <Typography variant="body2" color="text.secondary">
                  成功数
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats?.successCount ?? '-'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ErrorIcon color="error" />
                <Typography variant="body2" color="text.secondary">
                  失败数
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats?.failedCount ?? '-'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Webhook 列表
          </Typography>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : webhooks.length === 0 ? (
            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
              暂无 Webhook 配置，点击上方按钮创建
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>名称</TableCell>
                    <TableCell>URL</TableCell>
                    <TableCell>事件</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {webhooks.map((webhook) => (
                    <TableRow key={webhook.id}>
                      <TableCell>
                        <Typography fontWeight={500}>
                          {webhook.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {webhook.url}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {webhook.events.map((event) => (
                            <Chip
                              key={event}
                              label={event}
                              size="small"
                              variant="outlined"
                            />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={webhook.enabled ? <CheckCircleIcon /> : <PendingIcon />}
                          label={webhook.enabled ? '启用' : '禁用'}
                          color={webhook.enabled ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Tooltip title="编辑">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenDialog(webhook)}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="测试">
                            <IconButton
                              size="small"
                              onClick={() => handleTest(webhook.id)}
                              disabled={testingId === webhook.id}
                            >
                              {testingId === webhook.id ? (
                                <CircularProgress size={16} />
                              ) : (
                                <PlayArrowIcon />
                              )}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="查看日志">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenLogs(webhook.id)}
                            >
                              <HistoryIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="删除">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setDeleteId(webhook.id);
                                setOpenDeleteDialog(true);
                              }}
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {testResult && (
        <Dialog
          open={!!testResult}
          onClose={() => setTestResult(null)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>测试结果</DialogTitle>
          <DialogContent>
            <Alert
              severity={testResult.success ? 'success' : 'error'}
              sx={{ mt: 2 }}
            >
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {testResult.message}
              </pre>
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTestResult(null)}>关闭</Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editingWebhook ? '编辑 Webhook' : '创建 Webhook'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 2 }}>
            <Grid item xs={12}>
              <TextField
                label="名称"
                fullWidth
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="URL"
                fullWidth
                type="url"
                value={formData.url}
                onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                触发事件（可多选）
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {AVAILABLE_EVENTS.map((event) => (
                  <Chip
                    key={event}
                    label={event}
                    size="small"
                    onClick={() => handleEventToggle(event)}
                    color={formData.events.includes(event) ? 'primary' : 'default'}
                    variant={formData.events.includes(event) ? 'filled' : 'outlined'}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="请求头 (JSON)"
                fullWidth
                multiline
                rows={4}
                value={formData.headers}
                onChange={(e) => setFormData((prev) => ({ ...prev, headers: e.target.value }))}
                placeholder='{"Content-Type": "application/json"}'
              />
            </Grid>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
                <Typography variant="body1">
                  {formData.enabled ? '启用' : '禁用'}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>取消</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!formData.name || !formData.url || formData.events.length === 0}
          >
            {editingWebhook ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openDeleteDialog}
        onClose={() => {
          setOpenDeleteDialog(false);
          setDeleteId(null);
        }}
      >
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            确定要删除此 Webhook 吗？此操作无法撤销。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpenDeleteDialog(false);
              setDeleteId(null);
            }}
          >
            取消
          </Button>
          <Button onClick={handleDelete} color="error">
            删除
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openLogsDialog}
        onClose={() => {
          setOpenLogsDialog(false);
          setLogsWebhookId(null);
          setLogs([]);
        }}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Webhook 执行日志</DialogTitle>
        <DialogContent>
          {logsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : logs.length === 0 ? (
            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
              暂无执行日志
            </Typography>
          ) : (
            <>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>事件类型</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>触发时间</TableCell>
                      <TableCell>耗时 (ms)</TableCell>
                      <TableCell>状态码</TableCell>
                      <TableCell>错误信息</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Chip label={log.eventType} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={
                              log.status === 'success' ? (
                                <CheckCircleIcon />
                              ) : log.status === 'failed' ? (
                                <ErrorIcon />
                              ) : (
                                <PendingIcon />
                              )
                            }
                            label={
                              log.status === 'success' ? '成功' : log.status === 'failed' ? '失败' : '处理中'
                            }
                            color={
                              log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'default'
                            }
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {formatDate(log.triggeredAt)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {log.duration !== undefined ? log.duration : '-'}
                        </TableCell>
                        <TableCell>
                          {log.statusCode !== undefined ? log.statusCode : '-'}
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="caption"
                            color="error"
                            sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {log.error || '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, gap: 1 }}>
                {Array.from({ length: Math.ceil(logsTotal / logsPerPage) }, (_, i) => (
                  <Button
                    key={i}
                    variant={i === logsPage ? 'contained' : 'outlined'}
                    onClick={() => handleLogsPageChange(i)}
                  >
                    {i + 1}
                  </Button>
                ))}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setOpenLogsDialog(false);
            setLogsWebhookId(null);
            setLogs([]);
          }}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WebhookPage;