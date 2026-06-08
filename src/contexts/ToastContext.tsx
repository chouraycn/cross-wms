import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo } from 'react';
import { Snackbar, Alert, AlertColor, useTheme } from '@mui/material';

interface ToastContextValue {
  showToast: (message: string, severity?: AlertColor, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastProviderProps {
  children: ReactNode;
  /** 侧边栏是否收起 — 用于计算内容区域偏移 */
  sidebarCollapsed: boolean;
}

/**
 * 计算侧边栏宽度（与 Sidebar.tsx 常量对齐）
 * 收起: 83px | 展开: 260px
 */
function getSidebarWidth(collapsed: boolean): number {
  return collapsed ? 83 : 260;
}

/**
 * 侧边栏背景灰色（与 Sidebar.tsx SIDEBAR_BG 对齐）
 * 亮色: #F0F0F0  |  暗色: #1A1A1A
 * 统一 90% 不透明度（10% 透明）
 */
function getSidebarGray(isDark: boolean): string {
  return isDark
    ? 'rgba(26, 26, 26, 0.9)'
    : 'rgba(240, 240, 240, 0.9)';
}

/**
 * 文本颜色：亮色模式用深灰文字，暗色模式用浅灰文字
 */
function getTextColor(isDark: boolean): string {
  return isDark ? '#E5E7EB' : '#374151';
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children, sidebarCollapsed }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<AlertColor>('info');
  const [duration, setDuration] = useState(3000);
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

  // 清除之前的定时器
  const clearTimer = useCallback(() => {
    if (timer) {
      clearTimeout(timer);
      setTimer(null);
    }
  }, [timer]);

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => { if (timer) clearTimeout(timer); };
  }, [timer]);

  const showToast = useCallback((
    message: string,
    severity: AlertColor = 'info',
    duration: number = 3000,
  ) => {
    clearTimer();
    setMessage(message);
    setSeverity(severity);
    setDuration(duration);
    setOpen(true);

    const t = setTimeout(() => { setOpen(false); }, duration);
    setTimer(t);
  }, [clearTimer]);

  const handleClose = useCallback((_: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  const sidebarWidth = getSidebarWidth(sidebarCollapsed);

  /** Toast 在白色内容区域居中显示（侧边栏右侧区域），不受侧边栏展开/收起影响 */
  const snackbarSx = useMemo(() => ({
    zIndex: 1400 as const,
    left: `${sidebarWidth}px`,
    width: `calc(100vw - ${sidebarWidth}px)`,
    display: 'flex' as const,
    justifyContent: 'center' as const,
    transform: 'none' as const,
  }), [sidebarWidth]);

  const sidebarGray = getSidebarGray(isDark);
  const textColor = getTextColor(isDark);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={duration}
        onClose={handleClose}
        sx={snackbarSx}
      >
        <Alert
          onClose={handleClose}
          severity={severity}
          variant="outlined"
          sx={{
            width: '100%',
            minWidth: 200,
            maxWidth: 360,
            transform: 'scale(0.68)',
            transformOrigin: 'bottom center',
            backgroundColor: sidebarGray,
            color: textColor,
            borderColor: '#D1D5DB',
            backdropFilter: 'blur(12px)',
            '& .MuiAlert-icon': {
              color: '#111827',
            },
            '& .MuiAlert-message': {
              color: textColor,
            },
          }}
        >
          {message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
