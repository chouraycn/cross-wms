import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Switch,
  Alert,
  Divider,
  IconButton,
  Tooltip,
  useTheme,
  Button,
  CircularProgress,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import MicIcon from '@mui/icons-material/Mic';
import VideocamIcon from '@mui/icons-material/Videocam';
import NotificationsIcon from '@mui/icons-material/Notifications';
import StorageIcon from '@mui/icons-material/Storage';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import ScreenshotMonitorIcon from '@mui/icons-material/ScreenshotMonitor';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { AppSettings, TccPermissionItem } from '../../../contexts/AppSettingsContext';
import { isPyWebView } from '../../../services/tencentDocsApi';
import { switchSx } from '../sharedStyles';
import { getGrayScale } from '../../../constants/theme';

// ===================== Props =====================

export interface SystemAuthorizationTabProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
}

// ===================== macOS TCC 权限定义 =====================

interface TccPermissionDef {
  key: keyof AppSettings['systemAuthorization']['permissions'];
  label: string;
  description: string;
  icon: React.ReactNode;
  prefPane: string;
}

const TCC_PERMISSIONS: TccPermissionDef[] = [
  {
    key: 'screenRecording',
    label: '屏幕录制',
    description: '允许截图和屏幕内容读取，用于桌面自动化（desktop_screenshot 等工具）',
    icon: <ScreenshotMonitorIcon sx={{ fontSize: 22 }} />,
    prefPane: 'Privacy_ScreenCapture',
  },
  {
    key: 'accessibility',
    label: '辅助功能',
    description: '允许模拟鼠标点击、键盘输入和窗口控制（desktop_click / desktop_type 等工具）',
    icon: <AccessibilityNewIcon sx={{ fontSize: 22 }} />,
    prefPane: 'Privacy_Accessibility',
  },
  {
    key: 'inputMonitoring',
    label: '输入监控',
    description: '允许监听全局键盘事件，用于快捷键和输入检测',
    icon: <KeyboardIcon sx={{ fontSize: 22 }} />,
    prefPane: 'Privacy_ListenEvent',
  },
  {
    key: 'fullDiskAccess',
    label: '全磁盘访问',
    description: '允许读取和写入任意文件，用于 file_listDir / file_readFile / file_writeFile 等文件操作',
    icon: <StorageIcon sx={{ fontSize: 22 }} />,
    prefPane: 'Privacy_AllFiles',
  },
  {
    key: 'microphone',
    label: '麦克风',
    description: '允许访问麦克风，用于语音输入和音频录制功能',
    icon: <MicIcon sx={{ fontSize: 22 }} />,
    prefPane: 'Privacy_Microphone',
  },
  {
    key: 'camera',
    label: '摄像头',
    description: '允许访问摄像头，用于视频通话和扫描功能',
    icon: <VideocamIcon sx={{ fontSize: 22 }} />,
    prefPane: 'Privacy_Camera',
  },
  {
    key: 'notifications',
    label: '通知',
    description: '允许发送系统通知，用于自动化任务完成、报警等推送提醒',
    icon: <NotificationsIcon sx={{ fontSize: 22 }} />,
    prefPane: 'Notifications',
  },
  {
    key: 'automation',
    label: '自动化',
    description: '允许控制其他应用程序（如浏览器、办公套件），用于多应用协同操作',
    icon: <SecurityIcon sx={{ fontSize: 22 }} />,
    prefPane: 'Privacy_Automation',
  },
];

const TCC_PERMISSIONS_MAP: Record<string, string> = {
  screenRecording: 'screenRecording',
  accessibility: 'accessibility',
  inputMonitoring: 'inputMonitoring',
  fullDiskAccess: 'fullDiskAccess',
  microphone: 'microphone',
  camera: 'camera',
  notifications: 'notifications',
  automation: 'automation',
};

// ===================== Status Badge =====================

const StatusBadge: React.FC<{ status: TccPermissionItem['status']; isDark: boolean }> = ({ status, isDark }) => {
  const color =
    status === 'granted' ? '#4CAF50' :
    status === 'denied'  ? '#F44336' :
    isDark ? '#616161' : '#9E9E9E';

  const Icon =
    status === 'granted' ? CheckCircleOutlineIcon :
    status === 'denied'  ? CancelOutlinedIcon :
    HelpOutlineIcon;

  const label =
    status === 'granted' ? '已授权' :
    status === 'denied'  ? '未授权' :
    '未知';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Icon sx={{ fontSize: 16, color }} />
      <Typography sx={{ fontSize: '0.7rem', color, fontWeight: 500 }}>{label}</Typography>
    </Box>
  );
};

// ===================== Component =====================

const SystemAuthorizationTab: React.FC<SystemAuthorizationTabProps> = ({ draft, setDraft }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const enabled = draft.systemAuthorization?.enabled ?? false;
  const [checking, setChecking] = useState(false);
  const [ipcAvailable, setIpcAvailable] = useState<boolean | null>(null);

  const checkPermissions = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/permissions/status');
      const data = await res.json();
      setIpcAvailable(data.available);
      if (data.available && data.permissions) {
        const updatedPerms: typeof DEFAULT_PERMS = { ...DEFAULT_PERMS };
        for (const key of Object.keys(TCC_PERMISSIONS_MAP) as Array<keyof typeof DEFAULT_PERMS>) {
          const cap = TCC_PERMISSIONS_MAP[key];
          const granted = data.permissions[cap];
          if (granted !== undefined) {
            updatedPerms[key] = {
              ...updatedPerms[key],
              status: granted ? 'granted' : 'denied',
              lastChecked: Date.now(),
            };
          }
        }
        setDraft((prev) => ({
          ...prev,
          systemAuthorization: {
            ...prev.systemAuthorization,
            permissions: updatedPerms,
          },
        }));
      }
    } catch {
      setIpcAvailable(false);
    } finally {
      setChecking(false);
    }
  }, [setDraft]);

  const requestPermission = useCallback(async (key: keyof AppSettings['systemAuthorization']['permissions']) => {
    const cap = TCC_PERMISSIONS_MAP[key];
    if (!cap) return;
    try {
      await fetch(`/api/permissions/request/${cap}`, { method: 'POST' });
      await checkPermissions();
    } catch {
      /* ignore */
    }
  }, [checkPermissions]);

  const openSystemPrefs = useCallback(async (prefPane: string) => {
    const isPy = isPyWebView();
    if (prefPane === 'Notifications') {
      const url = 'x-apple.systempreferences:com.apple.preference.notifications';
      if (isPy && window.pywebview?.api) {
        try { await window.pywebview.api.open_in_browser(url); return; } catch { /* fallback */ }
      }
      return;
    }
    const url = `x-apple.systempreferences:com.apple.preference.security?${prefPane}`;
    if (isPy && window.pywebview?.api) {
      try { await window.pywebview.api.open_in_browser(url); return; } catch { /* fallback */ }
    }
    const fallbackUrl = 'x-apple.systempreferences:com.apple.preference.security';
    if (isPy && window.pywebview?.api) {
      try { await window.pywebview.api.open_in_browser(fallbackUrl); } catch { /* silent */ }
    }
  }, []);

  const openSystemSettings = useCallback(async (key: keyof AppSettings['systemAuthorization']['permissions']) => {
    const cap = TCC_PERMISSIONS_MAP[key];
    if (cap && ipcAvailable) {
      try {
        await fetch(`/api/permissions/open-settings/${cap}`, { method: 'POST' });
        return;
      } catch { /* fallback to old method */ }
    }
    const perm = TCC_PERMISSIONS.find(p => p.key === key);
    if (perm) openSystemPrefs(perm.prefPane);
  }, [ipcAvailable, openSystemPrefs]);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  const handleMasterToggle = () => {
    setDraft((prev) => ({
      ...prev,
      systemAuthorization: {
        ...prev.systemAuthorization,
        enabled: !(prev.systemAuthorization?.enabled ?? false),
        permissions: { ...(prev.systemAuthorization?.permissions ?? DEFAULT_PERMS) },
      },
    }));
  };

  const handlePermissionToggle = (key: keyof AppSettings['systemAuthorization']['permissions']) => {
    setDraft((prev) => {
      const perms = prev.systemAuthorization?.permissions ?? DEFAULT_PERMS;
      const current = perms[key];
      return {
        ...prev,
        systemAuthorization: {
          ...prev.systemAuthorization,
          enabled: prev.systemAuthorization?.enabled ?? false,
          permissions: {
            ...perms,
            [key]: { ...current, enabled: !current.enabled },
          },
        },
      };
    });
  };

  const enabledCount = TCC_PERMISSIONS.filter(
    (p) => draft.systemAuthorization?.permissions?.[p.key]?.enabled
  ).length;

  return (
    <Box sx={{ maxWidth: 680 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <AdminPanelSettingsIcon sx={{ fontSize: 28, color: gs.textPrimary }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: gs.textPrimary }}>
            系统授权
          </Typography>
        </Box>
        <Tooltip title="刷新权限状态">
          <IconButton
            size="small"
            onClick={checkPermissions}
            disabled={checking}
            sx={{ color: gs.textMuted, '&:hover': { color: gs.textPrimary, backgroundColor: gs.bgHover } }}
          >
            {checking ? <CircularProgress size={18} /> : <RefreshIcon sx={{ fontSize: 20 }} />}
          </IconButton>
        </Tooltip>
      </Box>
      <Typography sx={{ fontSize: '0.8rem', color: gs.textMuted, mb: 3 }}>
        管理 macOS 安全与隐私（TCC）权限。点击各权限卡片右侧的图标可打开系统设置进行授权。
      </Typography>

      {/* Master Switch */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          borderRadius: '12px',
          border: `1px solid ${enabled ? gs.textPrimary : gs.border}`,
          backgroundColor: enabled ? (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : gs.bgHover,
          transition: 'all 0.2s ease',
        }}
      >
        <Box>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: gs.textPrimary }}>
            启用系统授权
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mt: 0.25 }}>
            {enabled
              ? `已启用 · ${enabledCount}/8 项已授权`
              : '关闭 — 每次操作需手动确认授权'}
          </Typography>
        </Box>
        <Switch checked={enabled} onChange={handleMasterToggle} sx={switchSx} />
      </Box>

      {enabled && (
        <Alert
          severity="warning"
          sx={{
            mt: 2,
            fontSize: '0.8rem',
            borderRadius: '8px',
            '& .MuiAlert-icon': { alignItems: 'center' },
          }}
        >
          系统授权已启用。请在下方逐项确认各权限已在 macOS 系统设置中授予，否则自动化功能可能无法正常工作。
        </Alert>
      )}

      <Divider sx={{ my: 2.5 }} />

      {/* Permission List */}
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: gs.textMuted, mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        macOS 安全与隐私权限（TCC）
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {TCC_PERMISSIONS.map((perm) => {
          const permData = draft.systemAuthorization?.permissions?.[perm.key] ?? { enabled: false, status: 'unknown' as const, lastChecked: null };
          const isEnabled = permData.enabled;

          return (
            <Box
              key={perm.key}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
                p: 1.5,
                borderRadius: '10px',
                border: `1px solid ${isEnabled ? gs.textPrimary : gs.border}`,
                backgroundColor: isEnabled
                  ? (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                  : 'transparent',
                opacity: enabled ? 1 : 0.5,
                transition: 'opacity 0.2s ease',
              }}
            >
              <Box sx={{ mt: 0.2, flexShrink: 0, color: isEnabled ? gs.textPrimary : gs.textMuted }}>
                {perm.icon}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: gs.textPrimary }}>
                    {perm.label}
                  </Typography>
                  <StatusBadge status={permData.status} isDark={isDark} />
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mt: 0.25, lineHeight: 1.4 }}>
                  {perm.description}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flexShrink: 0, mt: 0.25 }}>
                <Tooltip title="打开系统设置" placement="left">
                  <IconButton
                    size="small"
                    onClick={() => openSystemSettings(perm.key)}
                    sx={{
                      color: gs.textMuted,
                      '&:hover': { color: gs.textPrimary, backgroundColor: gs.bgHover },
                    }}
                  >
                    <OpenInNewIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                {ipcAvailable && permData.status !== 'granted' && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => requestPermission(perm.key)}
                    sx={{
                      fontSize: '0.65rem',
                      py: 0.25,
                      minWidth: 'auto',
                      textTransform: 'none',
                      borderColor: gs.border,
                      color: gs.textSecondary,
                      '&:hover': {
                        borderColor: gs.textPrimary,
                        backgroundColor: gs.bgHover,
                      },
                    }}
                  >
                    授权
                  </Button>
                )}
                <Switch
                  checked={isEnabled}
                  size="small"
                  onChange={() => handlePermissionToggle(perm.key)}
                  disabled={!enabled}
                  sx={switchSx}
                />
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

// ===================== Default perms for fallback =====================

const DEFAULT_PERMS: AppSettings['systemAuthorization']['permissions'] = {
  screenRecording:     { enabled: false, status: 'unknown', lastChecked: null },
  accessibility:       { enabled: false, status: 'unknown', lastChecked: null },
  inputMonitoring:     { enabled: false, status: 'unknown', lastChecked: null },
  fullDiskAccess:      { enabled: false, status: 'unknown', lastChecked: null },
  microphone:          { enabled: false, status: 'unknown', lastChecked: null },
  camera:              { enabled: false, status: 'unknown', lastChecked: null },
  notifications:       { enabled: false, status: 'unknown', lastChecked: null },
  automation:          { enabled: false, status: 'unknown', lastChecked: null },
};

export default SystemAuthorizationTab;
