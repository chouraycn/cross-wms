import React from 'react';
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
  Divider,
  useTheme,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import MicIcon from '@mui/icons-material/Mic';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import type { AppSettings } from '../../../contexts/AppSettingsContext';
import { switchSx } from '../sharedStyles';
import { getGrayScale } from '../../../constants/theme';

// ===================== Props =====================

export interface SystemAuthorizationTabProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
}

// ===================== Component =====================

const SystemAuthorizationTab: React.FC<SystemAuthorizationTabProps> = ({ draft, setDraft }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const enabled = draft.systemAuthorization?.enabled ?? false;

  const handleToggle = () => {
    setDraft((prev) => ({
      ...prev,
      systemAuthorization: {
        ...prev.systemAuthorization,
        enabled: !(prev.systemAuthorization?.enabled ?? false),
      },
    }));
  };

  const featureItems = [
    {
      icon: <SecurityIcon sx={{ fontSize: 22, color: gs.textPrimary }} />,
      title: '安全模式跟随设置审核',
      desc: '开启后，工具安全审核自动通过，AI 调用的所有工具操作无需手动确认。',
    },
    {
      icon: <MicIcon sx={{ fontSize: 22, color: gs.textPrimary }} />,
      title: '语音等功能自动授权',
      desc: '语音输入、麦克风等系统级功能不再每次询问，直接授予访问权限。',
    },
    {
      icon: <NotificationsOffIcon sx={{ fontSize: 22, color: gs.textPrimary }} />,
      title: 'AI 不重复提醒权限',
      desc: 'AI 助手不会在每次对话中重复提醒您开启功能或确认权限。',
    },
  ];

  return (
    <Box sx={{ maxWidth: 680 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <AdminPanelSettingsIcon sx={{ fontSize: 28, color: gs.textPrimary }} />
        <Typography variant="h6" sx={{ fontWeight: 700, color: gs.textPrimary }}>
          系统授权
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.8rem', color: gs.textMuted, mb: 3 }}>
        启用后将自动授予系统级权限，工具操作和功能授权无需每次手动确认，提升操作效率。
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
            {enabled ? '已启用 — 所有系统权限自动授予' : '关闭 — 每次操作需手动确认授权'}
          </Typography>
        </Box>
        <Switch
          checked={enabled}
          onChange={handleToggle}
          sx={switchSx}
        />
      </Box>

      {/* Warning when enabled */}
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
          系统授权已启用。AI 调用的工具操作将自动执行，无需每次确认。请在信任的环境下使用此功能。
        </Alert>
      )}

      <Divider sx={{ my: 2.5 }} />

      {/* Feature List */}
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: gs.textMuted, mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        授权范围
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {featureItems.map((item, i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              gap: 1.5,
              p: 1.5,
              borderRadius: '10px',
              border: `1px solid ${gs.border}`,
              opacity: enabled ? 1 : 0.5,
              transition: 'opacity 0.2s ease',
            }}
          >
            <Box sx={{ mt: 0.25, flexShrink: 0 }}>{item.icon}</Box>
            <Box>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: gs.textPrimary }}>
                {item.title}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mt: 0.25 }}>
                {item.desc}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default SystemAuthorizationTab;
