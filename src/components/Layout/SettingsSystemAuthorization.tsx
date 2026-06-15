import React from 'react';
import {
  Box,
  Typography,
  Switch,
  Alert,
  Divider,
  useTheme,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import MicIcon from '@mui/icons-material/Mic';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import type { AppSettings } from '../../contexts/AppSettingsContext';
import { getGrayScale } from '../../constants/theme';
import { switchSx } from '../Settings/sharedStyles';

interface SettingsSystemAuthorizationProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const SettingsSystemAuthorization: React.FC<SettingsSystemAuthorizationProps> = ({ draft, setDraft }) => {
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

  const items = [
    { icon: <SecurityIcon sx={{ fontSize: 18, color: gs.textPrimary }} />, label: '安全审核自动通过' },
    { icon: <MicIcon sx={{ fontSize: 18, color: gs.textPrimary }} />, label: '语音等功能自动授权' },
    { icon: <NotificationsOffIcon sx={{ fontSize: 18, color: gs.textPrimary }} />, label: 'AI 不再重复提醒权限' },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <AdminPanelSettingsIcon sx={{ fontSize: 20, color: gs.textPrimary }} />
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: gs.textPrimary }}>
          系统授权
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mb: 2 }}>
        启用后可自动授予系统级权限，无需每次手动确认。
      </Typography>

      {/* Toggle */}
      <Box
        onClick={handleToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          borderRadius: '10px',
          border: `1px solid ${enabled ? gs.textPrimary : gs.border}`,
          cursor: 'pointer',
          backgroundColor: enabled ? (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent',
          transition: 'all 0.2s ease',
          '&:hover': { borderColor: gs.textPrimary },
        }}
      >
        <Box>
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: gs.textPrimary }}>
            启用系统授权
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
            {enabled ? '已启用' : '关闭'}
          </Typography>
        </Box>
        <Switch checked={enabled} size="small" sx={switchSx} />
      </Box>

      {enabled && (
        <Alert severity="warning" sx={{ mt: 1.5, fontSize: '0.7rem', borderRadius: '8px', '& .MuiAlert-icon': { alignItems: 'center' } }}>
          系统授权已启用，请在信任环境下使用。
        </Alert>
      )}

      <Divider sx={{ my: 2 }} />

      {/* Items */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map((item, i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              opacity: enabled ? 1 : 0.45,
              transition: 'opacity 0.2s',
            }}
          >
            {item.icon}
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>{item.label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default SettingsSystemAuthorization;
