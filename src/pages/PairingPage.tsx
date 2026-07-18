import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, useTheme, Alert, Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import QrCodeIcon from '@mui/icons-material/QrCode';
import DevicesIcon from '@mui/icons-material/Devices';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoIcon from '@mui/icons-material/Info';
import TimerIcon from '@mui/icons-material/Timer';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import type {
  PairingCodeInfo,
  PairedDevice,
  PairingSession,
  DiscoveredDevice,
} from '../services/pairingApi';
import {
  generatePairingCode,
  fetchPairingSessions,
  fetchPairedDevices,
  unpairDevice,
  discoverDevices,
} from '../services/pairingApi';

// ===================== 工具函数 / 配置 =====================

const DEVICE_TYPE_LABEL: Record<string, string> = {
  mobile: '手机',
  desktop: '桌面',
  tablet: '平板',
  unknown: '未知',
};

const DEVICE_TYPE_COLOR: Record<string, string> = {
  mobile: '#3B82F6',
  desktop: '#8B5CF6',
  tablet: '#F59E0B',
  unknown: '#6B7280',
};

/** 会话状态 → 中文标签 + 颜色 */
const SESSION_STATE_META: Record<string, { label: string; bg: string; color: string }> = {
  idle: { label: '等待中', bg: '#F3F4F6', color: '#6B7280' },
  discovering: { label: '发现中', bg: '#FEF3C7', color: '#D97706' },
  connecting: { label: '连接中', bg: '#FEF3C7', color: '#D97706' },
  authenticating: { label: '认证中', bg: '#FEF3C7', color: '#D97706' },
  'exchanging-keys': { label: '密钥交换中', bg: '#FEF3C7', color: '#D97706' },
  paired: { label: '已配对', bg: '#D1FAE5', color: '#059669' },
  failed: { label: '失败', bg: '#FEE2E2', color: '#DC2626' },
  expired: { label: '已过期', bg: '#FEE2E2', color: '#DC2626' },
  waiting: { label: '等待中', bg: '#F3F4F6', color: '#6B7280' },
  active: { label: '活跃', bg: '#D1FAE5', color: '#059669' },
};

function formatDateTime(ts?: number): string {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString('zh-CN');
  } catch {
    return '-';
  }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '已过期';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ===================== 二维码（CSS 网格模拟） =====================

/**
 * 将配对码字符串映射为伪二维码（CSS 网格）。
 * 注意：这是基于哈希的视觉占位，不可被真实扫码器识别；仅用于 UI 演示。
 * 任务要求可使用「简单 CSS 网格模拟」，此处采用该方案。
 */
function pseudoQrMatrix(text: string, size: number = 21): boolean[][] {
  // 简单哈希：基于字符 code 与位置生成确定性 bit
  const matrix: boolean[][] = [];
  let seed = 7;
  for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      row.push((seed & 0x1) === 1);
    }
    matrix.push(row);
  }
  // 三个角的定位方块（模拟 QR finder pattern）
  const drawFinder = (sr: number, sc: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const onInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[sr + r][sc + c] = onBorder || onInner;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);
  return matrix;
}

const QRCode: React.FC<{ value: string; size?: number }> = ({ value, size = 21 }) => {
  const matrix = useMemo(() => pseudoQrMatrix(value, size), [value, size]);
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${size}, 1fr)`,
        width: 210,
        height: 210,
        backgroundColor: '#FFFFFF',
        padding: '8px',
        borderRadius: 1,
        border: '1px solid #E5E7EB',
      }}
    >
      {matrix.flat().map((on, idx) => (
        <Box
          key={idx}
          sx={{
            backgroundColor: on ? '#111827' : '#FFFFFF',
            aspectRatio: '1 / 1',
          }}
        />
      ))}
    </Box>
  );
};

// ===================== 主组件 =====================

const PairingPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  // 配对码
  const [pairingCode, setPairingCode] = useState<PairingCodeInfo | null>(null);
  const [generating, setGenerating] = useState(false);
  const [now, setNow] = useState(Date.now());

  // 已配对设备
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  // 配对会话
  const [sessions, setSessions] = useState<PairingSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // 设备发现
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [discovering, setDiscovering] = useState(false);

  // 设备详情对话框
  const [detailDevice, setDetailDevice] = useState<PairedDevice | null>(null);

  // 倒计时定时器
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const res = await fetchPairedDevices();
      setDevices(res);
    } catch (e) {
      showToast(`加载已配对设备失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setDevicesLoading(false);
    }
  }, [showToast]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetchPairingSessions();
      setSessions(res);
    } catch (e) {
      showToast(`加载配对会话失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setSessionsLoading(false);
    }
  }, [showToast]);

  // 初始加载
  useEffect(() => {
    loadDevices();
    loadSessions();
  }, [loadDevices, loadSessions]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const info = await generatePairingCode();
      setPairingCode(info);
      setNow(Date.now());
      showToast(`配对码已生成: ${info.code}`, 'success');
      // 同步刷新会话列表
      loadSessions();
    } catch (e) {
      showToast(`生成配对码失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleUnpair = async (deviceId: string) => {
    if (!window.confirm(`确定要取消与该设备的配对吗？（${deviceId}）`)) return;
    try {
      await unpairDevice(deviceId);
      showToast('已取消配对', 'success');
      loadDevices();
    } catch (e) {
      showToast(`取消配对失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const res = await discoverDevices(5000);
      setDiscovered(res);
      showToast(`发现 ${res.length} 个附近设备`, 'success');
    } catch (e) {
      showToast(`设备发现失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setDiscovering(false);
    }
  };

  const handleRefreshAll = () => {
    loadDevices();
    loadSessions();
  };

  // 倒计时（ms）
  const remainingMs = pairingCode ? Math.max(0, pairingCode.expiresAt - now) : 0;
  const isExpired = pairingCode ? remainingMs <= 0 : false;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      {/* 标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 1 }}>
          <DevicesIcon /> 设备配对
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={discovering ? <CircularProgress size={14} /> : <WifiTetheringIcon />}
            onClick={handleDiscover}
            disabled={discovering}
            sx={{ textTransform: 'none' }}
          >
            {discovering ? '扫描中...' : '扫描附近设备'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={handleRefreshAll}
            sx={{ textTransform: 'none' }}
          >
            刷新
          </Button>
        </Box>
      </Box>

      {/* 配对码 + 二维码 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {/* 左侧：配对码生成 / 显示 */}
        <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1 }}>
            <QrCodeIcon fontSize="small" /> 配对码
          </Typography>

          {!pairingCode && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                点击下方按钮生成 6 位配对码
              </Typography>
              <Button
                variant="contained"
                onClick={handleGenerate}
                disabled={generating}
                startIcon={generating ? <CircularProgress size={16} /> : <QrCodeIcon />}
                sx={{ textTransform: 'none' }}
              >
                {generating ? '生成中...' : '生成配对码'}
              </Button>
            </Box>
          )}

          {pairingCode && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, width: '100%' }}>
              <Typography
                sx={{
                  fontSize: '3rem',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  letterSpacing: '0.4em',
                  color: isExpired ? 'text.disabled' : 'primary.main',
                  padding: '0.25em 0.5em',
                  borderRadius: 1,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                }}
              >
                {pairingCode.code}
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TimerIcon fontSize="small" sx={{ color: isExpired ? 'text.disabled' : '#D97706' }} />
                <Typography
                  sx={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    color: isExpired ? 'text.disabled' : '#D97706',
                  }}
                >
                  {isExpired ? '已过期' : formatCountdown(remainingMs)}
                </Typography>
              </Box>

              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                有效期至 {formatDateTime(pairingCode.expiresAt)}
              </Typography>

              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    if (pairingCode) {
                      navigator.clipboard?.writeText(pairingCode.code).then(
                        () => showToast('已复制配对码', 'success'),
                        () => showToast('复制失败', 'error'),
                      );
                    }
                  }}
                  sx={{ textTransform: 'none' }}
                >
                  复制
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleGenerate}
                  disabled={generating}
                  startIcon={generating ? <CircularProgress size={14} /> : <RefreshIcon />}
                  sx={{ textTransform: 'none' }}
                >
                  重新生成
                </Button>
              </Box>
            </Box>
          )}
        </Paper>

        {/* 右侧：二维码 */}
        <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>二维码（扫描配对）</Typography>
          {pairingCode && !isExpired ? (
            <QRCode value={pairingCode.code} />
          ) : (
            <Box
              sx={{
                width: 210,
                height: 210,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderRadius: 1,
                border: '1px dashed',
                borderColor: 'divider',
                color: 'text.disabled',
                fontSize: '0.75rem',
                textAlign: 'center',
                padding: 2,
              }}
            >
              {pairingCode ? '配对码已过期，请重新生成' : '生成配对码后显示二维码'}
            </Box>
          )}
          <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>
            * 演示用二维码（CSS 网格模拟），不可被真实扫码器识别
          </Typography>
        </Paper>
      </Box>

      {/* 已发现的附近设备 */}
      {discovered.length > 0 && (
        <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
              <WifiTetheringIcon fontSize="small" /> 附近设备（{discovered.length}）
            </Typography>
            <Button size="small" onClick={() => setDiscovered([])} sx={{ textTransform: 'none' }}>
              清空
            </Button>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {discovered.map((d) => (
              <Chip
                key={d.deviceId}
                label={`${d.deviceName}（${d.address}）`}
                size="small"
                sx={{ fontSize: '0.7rem', height: 24 }}
              />
            ))}
          </Box>
        </Paper>
      )}

      {/* 已配对设备列表 */}
      <Box>
        <Typography sx={{ fontSize: '1rem', fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <DevicesIcon fontSize="small" /> 已配对设备
          {devicesLoading && <CircularProgress size={14} />}
        </Typography>
        <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>设备名称</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>设备类型</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>配对时间</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>最后活跃时间</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>状态</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }} align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {devices.map((d) => {
                const typeLabel = DEVICE_TYPE_LABEL[d.deviceInfo.deviceType] || d.deviceInfo.deviceType || '未知';
                const typeColor = DEVICE_TYPE_COLOR[d.deviceInfo.deviceType] || DEVICE_TYPE_COLOR.unknown;
                return (
                  <TableRow key={d.deviceId} sx={{ '&:hover': { backgroundColor: gs.bgHover } }}>
                    <TableCell sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{d.deviceInfo.deviceName}</TableCell>
                    <TableCell>
                      <Chip
                        label={typeLabel}
                        size="small"
                        sx={{
                          fontSize: '0.65rem',
                          height: 20,
                          backgroundColor: typeColor + '22',
                          color: typeColor,
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{formatDateTime(d.pairedAt)}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{formatDateTime(d.lastSeenAt)}</TableCell>
                    <TableCell>
                      <Chip
                        label={d.isActive ? '在线' : '离线'}
                        size="small"
                        sx={{
                          fontSize: '0.65rem',
                          height: 20,
                          backgroundColor: d.isActive ? '#D1FAE5' : '#F3F4F6',
                          color: d.isActive ? '#059669' : '#6B7280',
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title="查看详情">
                          <IconButton size="small" onClick={() => setDetailDevice(d)}>
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="取消配对">
                          <IconButton size="small" onClick={() => handleUnpair(d.deviceId)} sx={{ color: '#EF4444' }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
              {devices.length === 0 && !devicesLoading && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary', fontSize: '0.875rem' }}>
                    暂无已配对设备
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* 配对会话列表 */}
      <Box>
        <Typography sx={{ fontSize: '1rem', fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <TimerIcon fontSize="small" /> 配对会话
          {sessionsLoading && <CircularProgress size={14} />}
        </Typography>
        <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>会话 ID</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>状态</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>创建时间</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>过期时间</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.map((s) => {
                const meta = SESSION_STATE_META[s.state] || { label: s.state, bg: '#F3F4F6', color: '#6B7280' };
                return (
                  <TableRow key={s.sessionId} sx={{ '&:hover': { backgroundColor: gs.bgHover } }}>
                    <TableCell sx={{ fontSize: '0.7rem', fontFamily: 'monospace' }}>{s.sessionId}</TableCell>
                    <TableCell>
                      <Chip
                        label={meta.label}
                        size="small"
                        sx={{ fontSize: '0.65rem', height: 20, backgroundColor: meta.bg, color: meta.color, fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{formatDateTime(s.createdAt)}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{formatDateTime(s.expiresAt)}</TableCell>
                  </TableRow>
                );
              })}
              {sessions.length === 0 && !sessionsLoading && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ textAlign: 'center', py: 4, color: 'text.secondary', fontSize: '0.875rem' }}>
                    暂无配对会话
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* 设备详情对话框 */}
      <Dialog open={!!detailDevice} onClose={() => setDetailDevice(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>设备详情</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {detailDevice && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <DetailRow label="设备 ID" value={detailDevice.deviceId} mono />
              <DetailRow label="设备名称" value={detailDevice.deviceInfo.deviceName} />
              <DetailRow
                label="设备类型"
                value={DEVICE_TYPE_LABEL[detailDevice.deviceInfo.deviceType] || detailDevice.deviceInfo.deviceType || '未知'}
              />
              <DetailRow label="操作系统" value={[detailDevice.deviceInfo.osName, detailDevice.deviceInfo.osVersion].filter(Boolean).join(' ') || '-'} />
              <DetailRow label="应用版本" value={detailDevice.deviceInfo.appVersion || '-'} />
              <DetailRow label="配对时间" value={formatDateTime(detailDevice.pairedAt)} />
              <DetailRow label="最后活跃" value={formatDateTime(detailDevice.lastSeenAt)} />
              <DetailRow label="在线状态" value={detailDevice.isActive ? '在线' : '离线'} />
              <DetailRow label="信任等级" value={`${detailDevice.trustLevel}`} />
              {detailDevice.deviceInfo.capabilities && detailDevice.deviceInfo.capabilities.length > 0 && (
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.5 }}>能力</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {detailDevice.deviceInfo.capabilities.map((cap) => (
                      <Chip key={cap} label={cap} size="small" sx={{ fontSize: '0.65rem', height: 20 }} />
                    ))}
                  </Box>
                </Box>
              )}
              <Divider sx={{ my: 1 }} />
              <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
                设备 ID 用于唯一标识已配对设备，可在取消配对后重新发起配对流程。
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDevice(null)} size="small" sx={{ textTransform: 'none' }}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const DetailRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', minWidth: 80 }}>{label}</Typography>
    <Typography sx={{ fontSize: '0.8rem', fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
      {value}
    </Typography>
  </Box>
);

export default PairingPage;
