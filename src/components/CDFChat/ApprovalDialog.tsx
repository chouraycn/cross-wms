import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Tooltip,
  Checkbox,
  FormControlLabel,
  TextField,
  Collapse,
  Alert,
  Paper,
  Fab,
  Badge,
  Slide,
  Zoom,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SecurityIcon from '@mui/icons-material/Security';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PersonIcon from '@mui/icons-material/Person';
import MinimizeIcon from '@mui/icons-material/Minimize';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VibrationIcon from '@mui/icons-material/Vibration';
import { type ExecAllowlistEntry, type CommandRisk } from '../../services/exec-approval/index';

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalRequest {
  id: string;
  toolName: string;
  toolDescription?: string;
  parameters: Record<string, unknown>;
  riskLevel: RiskLevel;
  reason?: string;
  timestamp: number;
  messageId?: string;
  command?: string;
  commandRisks?: CommandRisk[];
  allowlistMatch?: ExecAllowlistEntry;
  argv?: string[];
  timeout?: number; // 超时时间（毫秒）
  expiresAt?: number; // 过期时间戳
}

export interface ApprovalHistoryItem {
  id: string;
  toolName: string;
  command?: string;
  decision: 'approved' | 'rejected' | 'approved-always';
  timestamp: number;
  decidedBy?: string;
  reason?: string;
}

export interface ApprovalConfig {
  securityMode?: 'strict' | 'standard' | 'permissive';
  enableSound?: boolean;
  enableVibration?: boolean;
  defaultTimeout?: number;
  positionMode?: 'fixed-bottom' | 'float-bubble' | 'modal';
}

interface ApprovalDialogProps {
  open: boolean;
  requests: ApprovalRequest[];
  history?: ApprovalHistoryItem[];
  config?: ApprovalConfig;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onApproveAlways?: (requestId: string, pattern?: string) => void;
  onAddToWhitelist?: (pattern: string) => void;
  onApproveAll?: () => void;
  onRejectAll?: () => void;
  onTimeout?: (requestId: string) => void;
  onClose?: () => void;
  darkMode?: boolean;
}

const riskLevelConfig: Record<RiskLevel, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  safe: {
    label: '安全',
    color: '#16A34A',
    bgColor: 'rgba(22, 163, 74, 0.1)',
    icon: <CheckCircleIcon sx={{ fontSize: 20 }} />,
  },
  low: {
    label: '低风险',
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    icon: <InfoIcon sx={{ fontSize: 20 }} />,
  },
  medium: {
    label: '中风险',
    color: '#EAB308',
    bgColor: 'rgba(234, 179, 8, 0.1)',
    icon: <WarningAmberIcon sx={{ fontSize: 20 }} />,
  },
  high: {
    label: '高风险',
    color: '#F97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    icon: <ErrorIcon sx={{ fontSize: 20 }} />,
  },
  critical: {
    label: '严重风险',
    color: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: <ErrorIcon sx={{ fontSize: 20 }} />,
  },
};

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatParams = (params: Record<string, unknown>): string => {
  try {
    return JSON.stringify(params, null, 2);
  } catch {
    return String(params);
  }
};

export const ApprovalDialog: React.FC<ApprovalDialogProps> = React.memo(({
  open,
  requests,
  history = [],
  config = {},
  onApprove,
  onReject,
  onApproveAlways,
  onAddToWhitelist,
  onApproveAll,
  onRejectAll,
  onTimeout,
  onClose,
  darkMode = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const [whitelistPattern, setWhitelistPattern] = useState('');
  const [showWhitelistInput, setShowWhitelistInput] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [positionMode, setPositionMode] = useState<'fixed-bottom' | 'float-bubble' | 'modal'>(config.positionMode || 'modal');
  const [floatPosition, setFloatPosition] = useState({ x: 20, y: 20 });
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const dialogRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentRequest = useMemo(() => {
    return requests[currentIndex] || null;
  }, [requests, currentIndex]);

  // 超时倒计时逻辑
  useEffect(() => {
    if (!currentRequest || !open) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const timeout = currentRequest.timeout || config.defaultTimeout || 30000;
    const expiresAt = currentRequest.expiresAt || currentRequest.timestamp + timeout;
    const now = Date.now();
    const remaining = Math.max(0, expiresAt - now);

    setTimeLeft(remaining);

    timerRef.current = setInterval(() => {
      const newRemaining = Math.max(0, expiresAt - Date.now());
      setTimeLeft(newRemaining);

      if (newRemaining <= 0) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        // 超时自动拒绝
        if (onTimeout) {
          onTimeout(currentRequest.id);
        } else {
          onReject(currentRequest.id);
        }
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentRequest, open, config.defaultTimeout, onTimeout, onReject]);

  // 声音提示
  useEffect(() => {
    if (open && requests.length > 0 && config.enableSound) {
      // 创建提示音
      try {
        const audio = new Audio();
        audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQkAAABJREFUeJzt0DEBAAAAwqD1T20LL6AAAAAAAAAAAAAAAAAAAAAAAAAAADByYKoAQAAAAIAAAA=';
        audio.volume = 0.3;
        audio.play().catch(() => {
          // 静默失败
        });
        audioRef.current = audio;
      } catch (e) {
        // 静默失败
      }
    }
  }, [open, requests.length, config.enableSound]);

  // 振动提示
  useEffect(() => {
    if (open && requests.length > 0 && config.enableVibration) {
      try {
        if ('vibrate' in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
      } catch (e) {
        // 静默失败
      }
    }
  }, [open, requests.length, config.enableVibration]);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => Math.min(requests.length - 1, prev + 1));
  }, [requests.length]);

  const handleApprove = useCallback(() => {
    if (currentRequest) {
      if (alwaysAllow && onApproveAlways) {
        onApproveAlways(currentRequest.id, whitelistPattern || currentRequest.argv?.[0] || currentRequest.toolName);
      } else {
        onApprove(currentRequest.id);
      }
      setAlwaysAllow(false);
      setWhitelistPattern('');
      setShowWhitelistInput(false);
      if (requests.length <= 1) {
        onClose?.();
      } else {
        setCurrentIndex(prev => Math.min(prev, requests.length - 2));
      }
    }
  }, [currentRequest, alwaysAllow, whitelistPattern, onApproveAlways, onApprove, requests.length, onClose]);

  const handleReject = useCallback(() => {
    if (currentRequest) {
      onReject(currentRequest.id);
      if (requests.length <= 1) {
        onClose?.();
      } else {
        setCurrentIndex(prev => Math.min(prev, requests.length - 2));
      }
    }
  }, [currentRequest, onReject, requests.length, onClose]);

  const handleAddToWhitelist = useCallback(() => {
    if (whitelistPattern && onAddToWhitelist) {
      onAddToWhitelist(whitelistPattern);
      setWhitelistPattern('');
      setShowWhitelistInput(false);
    }
  }, [whitelistPattern, onAddToWhitelist]);

  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const handleRestore = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const handlePositionModeChange = useCallback((mode: 'fixed-bottom' | 'float-bubble' | 'modal') => {
    setPositionMode(mode);
    if (mode === 'float-bubble') {
      setFloatPosition({ x: 20, y: 20 });
    }
  }, []);

  // 拖拽逻辑
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (positionMode !== 'float-bubble') return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setIsDragging(true);
    setDragOffset({
      x: clientX - floatPosition.x,
      y: clientY - floatPosition.y,
    });
  }, [positionMode, floatPosition]);

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setFloatPosition({
      x: Math.max(0, Math.min(window.innerWidth - 400, clientX - dragOffset.x)),
      y: Math.max(0, Math.min(window.innerHeight - 500, clientY - dragOffset.y)),
    });
  }, [isDragging, dragOffset]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove);
      window.addEventListener('touchend', handleDragEnd);
    } else {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  const formatTimeLeft = useCallback((ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds <= 0) return '已超时';
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}分${secs}秒`;
  }, []);

  const riskConfig = currentRequest ? riskLevelConfig[currentRequest.riskLevel] : null;

  // 最小化视图
  if (open && isMinimized) {
    return (
      <Zoom in={open}>
        <Fab
          color="warning"
          size="medium"
          onClick={handleRestore}
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: 9999,
            bgcolor: '#F97316',
            '&:hover': { bgcolor: '#EA580C' },
          }}
        >
          <Badge badgeContent={requests.length} color="error">
            <NotificationsActiveIcon />
          </Badge>
        </Fab>
      </Zoom>
    );
  }

  // 浮动气泡视图
  if (open && positionMode === 'float-bubble') {
    return (
      <Paper
        ref={dialogRef}
        data-testid="approval-dialog"
        data-type={currentRequest?.toolName}
        elevation={12}
        sx={{
          position: 'fixed',
          left: floatPosition.x,
          top: floatPosition.y,
          width: 380,
          maxWidth: '90vw',
          maxHeight: '80vh',
          borderRadius: 3,
          bgcolor: darkMode ? '#1A1A1A' : '#FFFFFF',
          color: darkMode ? '#F3F4F6' : '#111827',
          zIndex: 9999,
          overflow: 'hidden',
          boxShadow: darkMode ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.3)',
          border: darkMode ? '1px solid #333' : '1px solid #E5E7EB',
        }}
      >
        {/* 拖拽区域 */}
        <Box
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1,
            bgcolor: darkMode ? '#252525' : '#F3F4F6',
            borderBottom: darkMode ? '1px solid #333' : '1px solid #E5E7EB',
            cursor: 'move',
            userSelect: 'none',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DragIndicatorIcon sx={{ color: darkMode ? '#9CA3AF' : '#6B7280', fontSize: 20 }} />
            <SecurityIcon sx={{ color: '#F97316', fontSize: 18 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              工具审批
            </Typography>
            <Chip
              size="small"
              label={`${currentIndex + 1}/${requests.length}`}
              sx={{
                fontSize: '0.65rem',
                height: 18,
                bgcolor: darkMode ? 'rgba(249, 115, 22, 0.2)' : 'rgba(249, 115, 22, 0.1)',
                color: '#F97316',
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="最小化">
              <IconButton size="small" onClick={handleMinimize} sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
                <MinimizeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="切换到模态窗口">
              <IconButton size="small" onClick={() => handlePositionModeChange('modal')} sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
                <OpenInFullIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* 内容区域 - 简化版 */}
        <Box sx={{ p: 2 }}>
          {currentRequest && riskConfig && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 1,
                    bgcolor: riskConfig.bgColor,
                    color: riskConfig.color,
                  }}
                >
                  {riskConfig.icon}
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                    {riskConfig.label}
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ color: darkMode ? '#EF4444' : '#DC2626', fontWeight: 600, ml: 'auto' }}>
                  ⏱ {formatTimeLeft(timeLeft)}
                </Typography>
              </Box>

              <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
                {currentRequest.toolName}
              </Typography>

              {currentRequest.command && (
                <Box
                  sx={{
                    bgcolor: darkMode ? '#252525' : '#F9FAFB',
                    borderRadius: 1,
                    p: 1,
                    mb: 1,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.75rem',
                    color: darkMode ? '#E5E7EB' : '#374151',
                    border: darkMode ? '1px solid #333' : '1px solid #E5E7EB',
                    maxHeight: 60,
                    overflow: 'auto',
                  }}
                >
                  {currentRequest.command}
                </Box>
              )}

              {/* 快捷操作按钮 */}
              <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                <Button
                  data-testid="reject-button"
                  variant="outlined"
                  size="small"
                  color="error"
                  fullWidth
                  onClick={handleReject}
                  startIcon={<CancelIcon />}
                  sx={{ fontSize: '0.75rem' }}
                >
                  拒绝
                </Button>
                <Button
                  data-testid="approve-button"
                  variant="contained"
                  size="small"
                  color="success"
                  fullWidth
                  onClick={handleApprove}
                  startIcon={<CheckCircleIcon />}
                  sx={{ fontSize: '0.75rem' }}
                >
                  批准
                </Button>
              </Box>

              {/* 批量操作 */}
              {requests.length > 1 && (
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button
                    variant="text"
                    size="small"
                    color="error"
                    onClick={onRejectAll}
                    sx={{ fontSize: '0.7rem', flex: 1 }}
                  >
                    全部拒绝
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    color="success"
                    onClick={onApproveAll}
                    sx={{ fontSize: '0.7rem', flex: 1 }}
                  >
                    全部批准
                  </Button>
                </Box>
              )}

              {/* 始终允许 */}
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={alwaysAllow}
                    onChange={(e) => setAlwaysAllow(e.target.checked)}
                    color="primary"
                  />
                }
                label={<Typography variant="caption">始终允许</Typography>}
                sx={{ mt: 1 }}
              />
            </>
          )}
        </Box>
      </Paper>
    );
  }

  // 固定底部视图
  if (open && positionMode === 'fixed-bottom') {
    return (
      <Slide direction="up" in={open}>
        <Paper
          data-testid="approval-dialog"
          data-type={currentRequest?.toolName}
          elevation={12}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: '50vh',
            borderRadius: '16px 16px 0 0',
            bgcolor: darkMode ? '#1A1A1A' : '#FFFFFF',
            color: darkMode ? '#F3F4F6' : '#111827',
            zIndex: 9999,
            overflow: 'hidden',
            borderTop: darkMode ? '1px solid #333' : '1px solid #E5E7EB',
          }}
        >
          {/* 顶部栏 */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            py: 2,
            borderBottom: darkMode ? '1px solid #333' : '1px solid #E5E7EB',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <SecurityIcon sx={{ color: '#F97316' }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                工具调用审批
              </Typography>
              {requests.length > 1 && (
                <Chip
                  size="small"
                  label={`${currentIndex + 1}/${requests.length}`}
                  sx={{
                    bgcolor: darkMode ? 'rgba(249, 115, 22, 0.2)' : 'rgba(249, 115, 22, 0.1)',
                    color: '#F97316',
                  }}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {currentRequest && (
                <Typography variant="body2" sx={{ color: '#EF4444', fontWeight: 600 }}>
                  ⏱ {formatTimeLeft(timeLeft)}
                </Typography>
              )}
              <Tooltip title="最小化">
                <IconButton onClick={handleMinimize} sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
                  <MinimizeIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="切换到模态窗口">
                <IconButton onClick={() => handlePositionModeChange('modal')} sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
                  <OpenInFullIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="切换到浮动气泡">
                <IconButton onClick={() => handlePositionModeChange('float-bubble')} sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
                  <DragIndicatorIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* 内容区域 */}
          <Box sx={{ p: 3, maxHeight: '40vh', overflow: 'auto' }}>
            {currentRequest && riskConfig && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, borderRadius: 2, bgcolor: riskConfig.bgColor, color: riskConfig.color }}>
                    {riskConfig.icon}
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{riskConfig.label}</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: darkMode ? '#9CA3AF' : '#6B7280', ml: 'auto' }}>
                    {formatTime(currentRequest.timestamp)}
                  </Typography>
                </Box>

                <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {currentRequest.toolName}
                </Typography>

                {currentRequest.command && (
                  <Box sx={{
                    bgcolor: darkMode ? '#252525' : '#F3F4F6',
                    borderRadius: 2,
                    p: 2,
                    mb: 2,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 13,
                    border: darkMode ? '1px solid #333' : '1px solid #E5E7EB',
                  }}>
                    {currentRequest.command}
                  </Box>
                )}

                {/* 快捷操作 */}
                <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
                  <Button data-testid="reject-button" variant="outlined" color="error" size="large" onClick={handleReject} startIcon={<CancelIcon />}>
                    拒绝
                  </Button>
                  <Button data-testid="approve-button" variant="contained" color="success" size="large" onClick={handleApprove} startIcon={<CheckCircleIcon />}>
                    批准
                  </Button>
                  {requests.length > 1 && (
                    <>
                      <Button variant="text" color="error" onClick={onRejectAll}>
                        全部拒绝
                      </Button>
                      <Button variant="text" color="success" onClick={onApproveAll}>
                        全部批准
                      </Button>
                    </>
                  )}
                </Box>

                <FormControlLabel
                  control={<Checkbox checked={alwaysAllow} onChange={(e) => setAlwaysAllow(e.target.checked)} color="primary" />}
                  label={<Typography variant="body2">始终允许此工具/命令</Typography>}
                  sx={{ mt: 1.5 }}
                />
              </>
            )}
          </Box>
        </Paper>
      </Slide>
    );
  }

  // 模态对话框视图（默认）
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: darkMode ? '#1A1A1A' : '#FFFFFF',
          color: darkMode ? '#F3F4F6' : '#111827',
        },
      }}
    >
      <DialogTitle
        sx={{
          textAlign: 'center',
          pt: 3,
          pb: 2,
          borderBottom: 1,
          borderColor: darkMode ? '#333' : '#E5E7EB',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <SecurityIcon sx={{ color: '#F97316' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            工具调用审批
          </Typography>
        </Box>
        {requests.length > 1 && (
          <Typography variant="body2" sx={{ color: darkMode ? '#9CA3AF' : '#6B7280', mt: 0.5 }}>
            {currentIndex + 1} / {requests.length} 个待审批请求
          </Typography>
        )}
        {currentRequest && timeLeft > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 1 }}>
            <ScheduleIcon sx={{ color: '#EF4444', fontSize: 18 }} />
            <Typography variant="body2" sx={{ color: '#EF4444', fontWeight: 600 }}>
              剩余时间：{formatTimeLeft(timeLeft)}
            </Typography>
          </Box>
        )}
      </DialogTitle>

      {/* 新增功能按钮栏 */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 3, py: 1, borderBottom: darkMode ? '1px solid #333' : '1px solid #E5E7EB' }}>
        <Tooltip title="最小化">
          <IconButton onClick={handleMinimize} size="small" sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
            <MinimizeIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="切换到固定底部">
          <IconButton onClick={() => handlePositionModeChange('fixed-bottom')} size="small" sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
            <OpenInFullIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="切换到浮动气泡">
          <IconButton onClick={() => handlePositionModeChange('float-bubble')} size="small" sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
            <DragIndicatorIcon />
          </IconButton>
        </Tooltip>
        {config.enableSound && (
          <Tooltip title="声音提示已开启">
            <IconButton size="small" sx={{ color: '#3B82F6' }}>
              <VolumeUpIcon />
            </IconButton>
          </Tooltip>
        )}
        {config.enableVibration && (
          <Tooltip title="振动提示已开启">
            <IconButton size="small" sx={{ color: '#3B82F6' }}>
              <VibrationIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <DialogContent sx={{ pt: 2, pb: 2, maxHeight: '60vh', overflow: 'auto' }}>
        {currentRequest && riskConfig && (
          <Box>
            {/* 风险等级和基本信息 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  bgcolor: riskConfig.bgColor,
                  color: riskConfig.color,
                }}
              >
                {riskConfig.icon}
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {riskConfig.label}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: darkMode ? '#9CA3AF' : '#6B7280', ml: 'auto' }}>
                {formatTime(currentRequest.timestamp)}
              </Typography>
            </Box>

            {/* 工具名称 */}
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              {currentRequest.toolName}
            </Typography>

            {currentRequest.toolDescription && (
              <Typography variant="body2" sx={{ color: darkMode ? '#9CA3AF' : '#6B7280', mb: 2 }}>
                {currentRequest.toolDescription}
              </Typography>
            )}

            {/* 命令信息（如果存在） */}
            {currentRequest.command && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  执行命令
                </Typography>
                <Box
                  sx={{
                    bgcolor: darkMode ? '#252525' : '#F3F4F6',
                    borderRadius: 2,
                    p: 2,
                    mb: 2,
                    fontFamily: 'JetBrains Mono, Fira Code, monospace',
                    fontSize: 13,
                    color: darkMode ? '#E5E7EB' : '#374151',
                    border: 1,
                    borderColor: darkMode ? '#333' : '#E5E7EB',
                  }}
                >
                  {currentRequest.command}
                </Box>
              </>
            )}

            {/* 命令风险（如果存在） */}
            {currentRequest.commandRisks && currentRequest.commandRisks.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  检测到的风险
                </Typography>
                <List dense sx={{ mb: 2, bgcolor: darkMode ? '#1F1F1F' : '#FAFAFA', borderRadius: 2 }}>
                  {currentRequest.commandRisks.map((risk, idx) => (
                    <ListItem key={idx}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {risk.severity === 'critical' && <ErrorIcon sx={{ fontSize: 18, color: '#EF4444' }} />}
                        {risk.severity === 'high' && <ErrorIcon sx={{ fontSize: 18, color: '#F97316' }} />}
                        {risk.severity === 'medium' && <WarningAmberIcon sx={{ fontSize: 18, color: '#EAB308' }} />}
                        {risk.severity === 'low' && <InfoIcon sx={{ fontSize: 18, color: '#3B82F6' }} />}
                      </ListItemIcon>
                      <ListItemText
                        primary={risk.description}
                        secondary={risk.kind}
                        primaryTypographyProps={{ fontSize: '0.875rem' }}
                        secondaryTypographyProps={{ fontSize: '0.75rem', color: darkMode ? '#9CA3AF' : '#6B7280' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            <Divider sx={{ my: 2 }} />

            {/* 调用参数 */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              调用参数
            </Typography>
            <Box
              sx={{
                bgcolor: darkMode ? '#252525' : '#F3F4F6',
                borderRadius: 2,
                p: 2,
                mb: 2,
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, Fira Code, monospace',
                  color: darkMode ? '#E5E7EB' : '#374151',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {formatParams(currentRequest.parameters)}
              </pre>
            </Box>

            {/* 风险说明 */}
            {currentRequest.reason && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  风险说明
                </Typography>
                <Box
                  sx={{
                    bgcolor: riskConfig.bgColor,
                    border: 1,
                    borderColor: riskConfig.color,
                    borderRadius: 2,
                    p: 2,
                  }}
                >
                  <Typography variant="body2" sx={{ color: riskConfig.color }}>
                    {currentRequest.reason}
                  </Typography>
                </Box>
              </>
            )}

            {/* 始终允许选项 */}
            <Divider sx={{ my: 2 }} />
            <FormControlLabel
              control={
                <Checkbox
                  checked={alwaysAllow}
                  onChange={(e) => {
                    setAlwaysAllow(e.target.checked);
                    if (e.target.checked && currentRequest.argv?.[0]) {
                      setWhitelistPattern(currentRequest.argv[0]);
                    }
                  }}
                  color="primary"
                />
              }
              label={
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  始终允许此工具/命令
                </Typography>
              }
              sx={{ mb: 1 }}
            />

            {/* 白名单快速添加 */}
            <Collapse in={alwaysAllow || showWhitelistInput}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: darkMode ? '#9CA3AF' : '#6B7280', mb: 1, display: 'block' }}>
                  将添加到白名单模式：
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="输入白名单模式（如：npm, git*, yarn）"
                    value={whitelistPattern}
                    onChange={(e) => setWhitelistPattern(e.target.value)}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: darkMode ? '#252525' : '#FFFFFF',
                      },
                    }}
                  />
                  <Tooltip title="添加到白名单">
                    <IconButton
                      size="small"
                      onClick={handleAddToWhitelist}
                      disabled={!whitelistPattern}
                      sx={{
                        bgcolor: darkMode ? '#252525' : '#F3F4F6',
                        '&:hover': { bgcolor: darkMode ? '#333' : '#E5E7EB' },
                      }}
                    >
                      <AddIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Typography variant="caption" sx={{ color: darkMode ? '#6B7280' : '#9CA3AF', mt: 0.5, display: 'block' }}>
                  支持通配符：* 匹任意字符，? 匹单个字符
                </Typography>
              </Box>
            </Collapse>

            {/* 操作历史记录 */}
            {history.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <IconButton
                    size="small"
                    onClick={() => setShowHistory(!showHistory)}
                    sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}
                  >
                    <HistoryIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    操作历史 ({history.length})
                  </Typography>
                </Box>
                <Collapse in={showHistory}>
                  <List dense sx={{ bgcolor: darkMode ? '#1F1F1F' : '#FAFAFA', borderRadius: 2, maxHeight: 200, overflow: 'auto' }}>
                    {history.slice(0, 10).map((item, idx) => (
                      <ListItem key={idx} divider={idx < history.length - 1}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          {item.decision === 'approved' && <CheckCircleIcon sx={{ fontSize: 16, color: '#16A34A' }} />}
                          {item.decision === 'rejected' && <CancelIcon sx={{ fontSize: 16, color: '#EF4444' }} />}
                          {item.decision === 'approved-always' && <CheckCircleIcon sx={{ fontSize: 16, color: '#3B82F6' }} />}
                        </ListItemIcon>
                        <ListItemText
                          primary={item.command || item.toolName}
                          secondary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                              <ScheduleIcon sx={{ fontSize: 12, color: darkMode ? '#6B7280' : '#9CA3AF' }} />
                              <Typography variant="caption" sx={{ color: darkMode ? '#6B7280' : '#9CA3AF' }}>
                                {formatTime(item.timestamp)}
                              </Typography>
                              {item.decidedBy && (
                                <>
                                  <PersonIcon sx={{ fontSize: 12, color: darkMode ? '#6B7280' : '#9CA3AF' }} />
                                  <Typography variant="caption" sx={{ color: darkMode ? '#6B7280' : '#9CA3AF' }}>
                                    {item.decidedBy}
                                  </Typography>
                                </>
                              )}
                            </Box>
                          }
                          primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: 500 }}
                        />
                        <Chip
                          size="small"
                          label={
                            item.decision === 'approved' ? '批准' :
                            item.decision === 'rejected' ? '拒绝' : '始终允许'
                          }
                          sx={{
                            fontSize: '0.65rem',
                            height: 20,
                            bgcolor:
                              item.decision === 'approved' ? 'rgba(22, 163, 74, 0.1)' :
                              item.decision === 'rejected' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                            color:
                              item.decision === 'approved' ? '#16A34A' :
                              item.decision === 'rejected' ? '#EF4444' : '#3B82F6',
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </>
            )}
          </Box>
        )}

        {requests.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleIcon sx={{ fontSize: 48, color: '#16A34A', mb: 2 }} />
            <Typography variant="h6">暂无待审批请求</Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          justifyContent: 'space-between',
          px: 3,
          pb: 2,
          borderTop: 1,
          borderColor: darkMode ? '#333' : '#E5E7EB',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
          {requests.length > 1 && (
            <>
              <Tooltip title="上一个">
                <span>
                  <IconButton
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    size="small"
                    sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}
                  >
                    <ChevronLeftIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="下一个">
                <span>
                  <IconButton
                    onClick={handleNext}
                    disabled={currentIndex === requests.length - 1}
                    size="small"
                    sx={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}
                  >
                    <ChevronRightIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {requests.length > 1 && (
            <>
              <Button
                variant="outlined"
                size="small"
                onClick={onRejectAll}
                color="error"
              >
                全部拒绝
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={onApproveAll}
                color="success"
              >
                全部批准
              </Button>
            </>
          )}
          <Button
            variant="outlined"
            onClick={handleReject}
            color="error"
            startIcon={<CancelIcon />}
            disabled={!currentRequest}
          >
            拒绝
          </Button>
          <Button
            variant="contained"
            onClick={handleApprove}
            color="success"
            startIcon={<CheckCircleIcon />}
            disabled={!currentRequest}
          >
            批准
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
});
