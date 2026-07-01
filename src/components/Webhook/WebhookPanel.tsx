/**
 * WebhookPanel — Webhook 管理面板
 *
 * 提供 Webhook 列表、创建/编辑/删除、测试发送、日志查看等功能
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Switch,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Collapse,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  Alert,
  useTheme,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import WebhookIcon from '@mui/icons-material/Webhook';
import CodeIcon from '@mui/icons-material/Code';

import type {
  Webhook,
  WebhookEventType,
  WebhookStatus,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  WebhookLog,
} from '../../services/webhook/types';
import {
  fetchWebhooks,
  createWebhookApi,
  updateWebhookApi,
  deleteWebhookApi,
  testWebhookApi,
  fetchWebhookLogs,
} from '../../services/webhook/api';
import { getGrayScale } from '../../constants/theme';
import { useToast } from '../../contexts/ToastContext';

// ===================== Constants =====================

const EVENT_TYPE_LABELS: Record<WebhookEventType, string> = {
  'inventory.update': '库存更新',
  'inventory.alert': '库存预警',
  'order.created': '订单创建',
  'order.updated': '订单更新',
  'order.completed': '订单完成',
  'shipment.created': '发货创建',
  'shipment.updated': '发货更新',
  'shipment.delivered': '发货送达',
  'user.action': '用户操作',
  'system.alert': '系统预警',
  'custom': '自定义事件',
};

const STATUS_ICON_MAP: Record<WebhookStatus, React.ReactNode> = {
  active: <CheckCircleOutlineIcon sx={{ fontSize: 16, color: '#22C55E' }} />,
  inactive: <LinkOffIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />,
  error: <ErrorOutlineIcon sx={{ fontSize: 16, color: '#EF4444' }} />,
};

const STATUS_LABEL_MAP: Record<WebhookStatus, string> = {
  active: '活跃',
  inactive: '未激活',
  error: '错误',
};

// ===================== WebhookCard Component =====================

interface WebhookCardProps {
  webhook: Webhook;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onEdit: (webhook: Webhook) => void;
  onDelete: (id: string) => void;
  onTest: (webhook: Webhook) => void;
  onViewLogs: (webhook: Webhook) => void;
}

const WebhookCard: React.FC<WebhookCardProps> = ({
  webhook,
  onToggleEnabled,
  onEdit,
  onDelete,
  onTest,
  onViewLogs,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [expanded, setExpanded] = useState(false);
  const [operating, setOperating] = useState(false);

  const handleTest = async () => {
    setOperating(true);
    try {
      await onTest(webhook);
    } finally {
      setOperating(false);
    }
  };

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${webhook.status === 'active' && webhook.enabled ? 'rgba(34,197,94,0.3)' : gs.border}`,
        backgroundColor: webhook.status === 'active' && webhook.enabled
          ? (isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.03)')
          : gs.bgPanel,
        mb: 1.5,
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {/* 状态图标 */}
        {STATUS_ICON_MAP[webhook.status]}

        {/* 名称 */}
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: gs.textPrimary, flex: 1 }}>
          {webhook.name}
        </Typography>

        {/* 状态 Chip */}
        <Chip
          label={STATUS_LABEL_MAP[webhook.status]}
          size="small"
          sx={{
            fontSize: '0.7rem',
            height: 22,
            backgroundColor:
              webhook.status === 'active' ? 'rgba(34,197,94,0.12)'
              : webhook.status === 'error' ? 'rgba(239,68,68,0.12)'
              : gs.bgHover,
            color:
              webhook.status === 'active' ? '#22C55E'
              : webhook.status === 'error' ? '#EF4444'
              : gs.textMuted,
          }}
        />

        {/* 触发次数 Chip */}
        {webhook.triggerCount > 0 && (
          <Chip
            label={`${webhook.triggerCount} 次触发`}
            size="small"
            sx={{
              fontSize: '0.7rem',
              height: 22,
              backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)',
              color: 'rgba(99,102,241,1)',
            }}
          />
        )}

        {/* 启用开关 */}
        <Switch
          checked={webhook.enabled}
          onChange={e => onToggleEnabled(webhook.id, e.target.checked)}
          size="small"
          disabled={operating}
        />

        {/* 操作按钮 */}
        <Tooltip title="测试发送">
          <IconButton size="small" onClick={handleTest} disabled={operating} sx={{ color: gs.textMuted }}>
            <PlayArrowIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="查看日志">
          <IconButton size="small" onClick={() => onViewLogs(webhook)} sx={{ color: gs.textMuted }}>
            <HistoryIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="编辑">
          <IconButton size="small" onClick={() => onEdit(webhook)} sx={{ color: gs.textMuted }}>
            <EditIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="删除">
          <IconButton size="small" onClick={() => onDelete(webhook.id)} sx={{ color: gs.textMuted }}>
            <DeleteOutlineIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {/* 展开/收起 */}
        <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ color: gs.textMuted }}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Box>

      {/* URL */}
      <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mt: 0.75, fontFamily: 'monospace' }}>
        {webhook.url}
      </Typography>

      {/* Description */}
      {webhook.description && (
        <Typography sx={{ fontSize: '0.78rem', color: gs.textMuted, mt: 0.5 }}>
          {webhook.description}
        </Typography>
      )}

      {/* 详情（展开） */}
      <Collapse in={expanded}>
        <Box sx={{ mt: 1.5 }}>
          {/* 事件类型 */}
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textSecondary, mb: 0.5 }}>
            监听事件：
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {webhook.events.map(event => (
              <Chip
                key={event}
                label={EVENT_TYPE_LABELS[event]}
                size="small"
                sx={{
                  fontSize: '0.68rem',
                  height: 20,
                  backgroundColor: gs.bgHover,
                  color: gs.textMuted,
                }}
              />
            ))}
          </Box>

          {/* 统计信息 */}
          <Box sx={{ mt: 1.5, display: 'flex', gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: '0.72rem', color: gs.textMuted }}>
                成功: {webhook.triggerCount - webhook.failureCount}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.72rem', color: webhook.failureCount > 0 ? '#EF4444' : gs.textMuted }}>
                失败: {webhook.failureCount}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.72rem', color: gs.textMuted }}>
                最后触发: {webhook.lastTriggeredAt || '从未'}
              </Typography>
            </Box>
          </Box>

          {/* Headers */}
          {webhook.headers && Object.keys(webhook.headers).length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textSecondary, mb: 0.5 }}>
                自定义 Headers：
              </Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: '0.72rem', color: gs.textMuted }}>
                {Object.entries(webhook.headers).map(([key, value]) => (
                  <Box key={key} sx={{ mb: 0.25 }}>
                    {key}: {value}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

// ===================== WebhookFormDialog Component =====================

interface WebhookFormDialogProps {
  open: boolean;
  editingWebhook: Webhook | null;
  onClose: () => void;
  onSave: (data: CreateWebhookRequest | UpdateWebhookRequest) => void;
}

const WebhookFormDialog: React.FC<WebhookFormDialogProps> = ({
  open,
  editingWebhook,
  onClose,
  onSave,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [formData, setFormData] = useState<CreateWebhookRequest>({
    name: '',
    url: '',
    events: [],
    secret: '',
    description: '',
    headers: {},
    enabled: true,
  });

  const [customHeaderKey, setCustomHeaderKey] = useState('');
  const [customHeaderValue, setCustomHeaderValue] = useState('');

  useEffect(() => {
    if (editingWebhook) {
      setFormData({
        name: editingWebhook.name,
        url: editingWebhook.url,
        events: editingWebhook.events,
        secret: editingWebhook.secret || '',
        description: editingWebhook.description || '',
        headers: editingWebhook.headers || {},
        enabled: editingWebhook.enabled,
      });
    } else {
      setFormData({
        name: '',
        url: '',
        events: [],
        secret: '',
        description: '',
        headers: {},
        enabled: true,
      });
    }
  }, [editingWebhook, open]);

  const handleToggleEvent = (event: WebhookEventType) => {
    const newEvents = formData.events.includes(event)
      ? formData.events.filter(e => e !== event)
      : [...formData.events, event];
    setFormData({ ...formData, events: newEvents });
  };

  const handleAddHeader = () => {
    if (customHeaderKey && customHeaderValue) {
      setFormData({
        ...formData,
        headers: {
          ...formData.headers,
          [customHeaderKey]: customHeaderValue,
        },
      });
      setCustomHeaderKey('');
      setCustomHeaderValue('');
    }
  };

  const handleRemoveHeader = (key: string) => {
    const newHeaders = { ...formData.headers };
    delete newHeaders[key];
    setFormData({ ...formData, headers: newHeaders });
  };

  const handleSave = () => {
    if (!formData.name || !formData.url || formData.events.length === 0) {
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          border: `1px solid ${gs.border}`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              backgroundColor: gs.textPrimary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WebhookIcon sx={{ fontSize: 18, color: gs.bgPanel }} />
          </Box>
          <Typography sx={{ fontWeight: 700, color: gs.textPrimary }}>
            {editingWebhook ? '编辑 Webhook' : '创建 Webhook'}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* 基本信息 */}
          <TextField
            label="名称"
            fullWidth
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            required
            sx={{ mt: 1 }}
          />

          <TextField
            label="URL"
            fullWidth
            value={formData.url}
            onChange={e => setFormData({ ...formData, url: e.target.value })}
            placeholder="https://your-server.com/webhook"
            required
          />

          <TextField
            label="描述"
            fullWidth
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            multiline
            rows={2}
            placeholder="可选：添加描述说明此 Webhook 的用途"
          />

          <TextField
            label="Secret（可选）"
            fullWidth
            value={formData.secret}
            onChange={e => setFormData({ ...formData, secret: e.target.value })}
            type="password"
            placeholder="用于签名验证的密钥"
          />

          {/* 事件类型 */}
          <Box>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary, mb: 1 }}>
              监听事件 *
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {(Object.keys(EVENT_TYPE_LABELS) as WebhookEventType[]).map(event => (
                <Chip
                  key={event}
                  label={EVENT_TYPE_LABELS[event]}
                  onClick={() => handleToggleEvent(event)}
                  sx={{
                    fontSize: '0.75rem',
                    height: 26,
                    backgroundColor: formData.events.includes(event)
                      ? 'rgba(99,102,241,0.12)'
                      : gs.bgHover,
                    color: formData.events.includes(event)
                      ? 'rgba(99,102,241,1)'
                      : gs.textMuted,
                    border: formData.events.includes(event)
                      ? '1px solid rgba(99,102,241,0.3)'
                      : '1px solid transparent',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* 自定义 Headers */}
          <Box>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textSecondary, mb: 1 }}>
              自定义 Headers
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                size="small"
                placeholder="Header Name"
                value={customHeaderKey}
                onChange={e => setCustomHeaderKey(e.target.value)}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                placeholder="Header Value"
                value={customHeaderValue}
                onChange={e => setCustomHeaderValue(e.target.value)}
                sx={{ flex: 1 }}
              />
              <Button size="small" onClick={handleAddHeader} disabled={!customHeaderKey || !customHeaderValue}>
                添加
              </Button>
            </Box>
            {formData.headers && Object.keys(formData.headers).length > 0 && (
              <Box sx={{ p: 1, borderRadius: 1, backgroundColor: gs.bgHover }}>
                {Object.entries(formData.headers).map(([key, value]) => (
                  <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: gs.textSecondary }}>
                      {key}: {value}
                    </Typography>
                    <IconButton size="small" onClick={() => handleRemoveHeader(key)} sx={{ color: gs.textMuted }}>
                      <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {/* 启用状态 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Switch
              checked={formData.enabled}
              onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
            />
            <Typography sx={{ fontSize: '0.85rem', color: gs.textSecondary }}>
              启用此 Webhook
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: gs.textMuted }}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!formData.name || !formData.url || formData.events.length === 0}
          sx={{
            backgroundColor: gs.textPrimary,
            '&:hover': { backgroundColor: gs.textSecondary },
          }}
        >
          {editingWebhook ? '保存' : '创建'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ===================== WebhookLogsDrawer Component =====================

interface WebhookLogsDrawerProps {
  open: boolean;
  webhook: Webhook | null;
  onClose: () => void;
}

const WebhookLogsDrawer: React.FC<WebhookLogsDrawerProps> = ({
  open,
  webhook,
  onClose,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && webhook) {
      setLoading(true);
      fetchWebhookLogs(webhook.id, 50)
        .then(setLogs)
        .catch(() => setLogs([]))
        .finally(() => setLoading(false));
    }
  }, [open, webhook]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 480,
          p: 3,
          backgroundColor: gs.bgPanel,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <HistoryIcon sx={{ fontSize: 24, color: gs.textPrimary }} />
        <Typography variant="h6" sx={{ fontWeight: 700, color: gs.textPrimary }}>
          {webhook?.name} - 执行日志
        </Typography>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : logs.length === 0 ? (
        <Typography sx={{ color: gs.textMuted, textAlign: 'center', py: 4 }}>
          暂无执行日志
        </Typography>
      ) : (
        <List>
          {logs.map(log => (
            <ListItem
              key={log.id}
              sx={{
                p: 1.5,
                mb: 1,
                borderRadius: 1,
                backgroundColor: gs.bgHover,
              }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                {log.status === 'success' ? (
                  <CheckCircleOutlineIcon sx={{ fontSize: 20, color: '#22C55E' }} />
                ) : log.status === 'failed' ? (
                  <ErrorOutlineIcon sx={{ fontSize: 20, color: '#EF4444' }} />
                ) : (
                  <CircularProgress size={20} />
                )}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
                      {EVENT_TYPE_LABELS[log.eventType]}
                    </Typography>
                    {log.statusCode && (
                      <Chip
                        label={log.statusCode}
                        size="small"
                        sx={{
                          fontSize: '0.68rem',
                          height: 18,
                          backgroundColor: log.statusCode < 400 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                          color: log.statusCode < 400 ? '#22C55E' : '#EF4444',
                        }}
                      />
                    )}
                    {log.duration && (
                      <Typography sx={{ fontSize: '0.72rem', color: gs.textMuted }}>
                        {log.duration}ms
                      </Typography>
                    )}
                  </Box>
                }
                secondary={
                  <Box sx={{ mt: 0.5 }}>
                    <Typography sx={{ fontSize: '0.72rem', color: gs.textMuted }}>
                      {new Date(log.triggeredAt).toLocaleString()}
                    </Typography>
                    {log.error && (
                      <Typography sx={{ fontSize: '0.72rem', color: '#EF4444', mt: 0.5 }}>
                        {log.error}
                      </Typography>
                    )}
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Drawer>
  );
};

// ===================== Main WebhookPanel Component =====================

const WebhookPanel: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
  const [selectedWebhookForLogs, setSelectedWebhookForLogs] = useState<Webhook | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // 加载 Webhooks
  const loadWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWebhooks();
      setWebhooks(data);
    } catch (error) {
      showToast('加载 Webhook 失败', 'error');
      setWebhooks([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  // 切换启用状态
  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await updateWebhookApi(id, { enabled });
      showToast(enabled ? 'Webhook 已启用' : 'Webhook 已禁用', 'success');
      await loadWebhooks();
    } catch (error) {
      showToast('操作失败', 'error');
    }
  };

  // 创建/编辑
  const handleSaveWebhook = async (data: CreateWebhookRequest | UpdateWebhookRequest) => {
    try {
      if (editingWebhook) {
        await updateWebhookApi(editingWebhook.id, data);
        showToast('Webhook 已更新', 'success');
      } else {
        await createWebhookApi(data as CreateWebhookRequest);
        showToast('Webhook 已创建', 'success');
      }
      setFormOpen(false);
      setEditingWebhook(null);
      await loadWebhooks();
    } catch (error) {
      showToast('操作失败', 'error');
    }
  };

  // 删除
  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除此 Webhook 吗？')) return;
    try {
      await deleteWebhookApi(id);
      showToast('Webhook 已删除', 'success');
      await loadWebhooks();
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  // 测试发送
  const handleTest = async (webhook: Webhook) => {
    try {
      const result = await testWebhookApi({
        webhookId: webhook.id,
        eventType: webhook.events[0],
      });

      if (result.success) {
        showToast(`测试成功 (${result.responseTime}ms)`, 'success');
        setTestResult({ success: true, message: `HTTP ${result.statusCode} - ${result.responseTime}ms` });
      } else {
        showToast(`测试失败: ${result.error}`, 'error');
        setTestResult({ success: false, message: result.error || '测试失败' });
      }

      setTimeout(() => setTestResult(null), 3000);
    } catch (error) {
      showToast('测试失败', 'error');
    }
  };

  // 查看日志
  const handleViewLogs = (webhook: Webhook) => {
    setSelectedWebhookForLogs(webhook);
    setLogsDrawerOpen(true);
  };

  return (
    <Box sx={{ maxWidth: 900 }}>
      {/* 标题和创建按钮 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <WebhookIcon sx={{ fontSize: 28, color: gs.textPrimary }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: gs.textPrimary }}>
            Webhook 管理
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingWebhook(null);
            setFormOpen(true);
          }}
          sx={{
            backgroundColor: gs.textPrimary,
            '&:hover': { backgroundColor: gs.textSecondary },
          }}
        >
          创建 Webhook
        </Button>
      </Box>

      {/* 说明文字 */}
      <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted, mb: 3 }}>
        Webhook 用于接收外部系统的事件通知。配置 URL 和监听事件后，系统会在相应事件发生时向指定 URL 发送 HTTP POST 请求。
      </Typography>

      {/* 测试结果提示 */}
      {testResult && (
        <Alert
          severity={testResult.success ? 'success' : 'error'}
          sx={{ mb: 2 }}
          onClose={() => setTestResult(null)}
        >
          {testResult.message}
        </Alert>
      )}

      {/* Webhook 列表 */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : webhooks.length === 0 ? (
        <Paper
          sx={{
            p: 4,
            textAlign: 'center',
            backgroundColor: gs.bgHover,
            borderRadius: 2,
          }}
        >
          <WebhookIcon sx={{ fontSize: 48, color: gs.textMuted, mb: 1 }} />
          <Typography sx={{ color: gs.textMuted, fontSize: '0.9rem' }}>
            暂无 Webhook，点击上方按钮创建
          </Typography>
        </Paper>
      ) : (
        <Box>
          {webhooks.map(webhook => (
            <WebhookCard
              key={webhook.id}
              webhook={webhook}
              onToggleEnabled={handleToggleEnabled}
              onEdit={(w) => {
                setEditingWebhook(w);
                setFormOpen(true);
              }}
              onDelete={handleDelete}
              onTest={handleTest}
              onViewLogs={handleViewLogs}
            />
          ))}
        </Box>
      )}

      {/* 创建/编辑对话框 */}
      <WebhookFormDialog
        open={formOpen}
        editingWebhook={editingWebhook}
        onClose={() => {
          setFormOpen(false);
          setEditingWebhook(null);
        }}
        onSave={handleSaveWebhook}
      />

      {/* 日志查看抽屉 */}
      <WebhookLogsDrawer
        open={logsDrawerOpen}
        webhook={selectedWebhookForLogs}
        onClose={() => {
          setLogsDrawerOpen(false);
          setSelectedWebhookForLogs(null);
        }}
      />
    </Box>
  );
};

export default WebhookPanel;