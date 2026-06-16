import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Dialog,
  Button,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import { useSystemAuthSettings } from '../../contexts/AppSettingsContext';
import type { SystemAuthorizationConfig } from '../../contexts/AppSettingsContext';
import { getGrayScale } from '../../constants/theme';
import SettingsSystemAuthorization from './SettingsSystemAuthorization';
import { useToast } from '../../contexts/ToastContext';

/* ------------------------------------------------------------------ */
/*  Main Dialog                                                         */
/* ------------------------------------------------------------------ */
export interface SystemAuthorizationDialogProps {
  open: boolean;
  onClose: () => void;
}

const SystemAuthorizationDialog: React.FC<SystemAuthorizationDialogProps> = ({ open, onClose }) => {
  const { settings, updateSettings, resetSettings } = useSystemAuthSettings();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [draft, setDraft] = useState<SystemAuthorizationConfig>({ ...settings });

  // 每次打开时重置为当前 settings
  useEffect(() => {
    if (open) {
      setDraft({ ...settings });
    }
  }, [open, settings]);

  const handleSave = useCallback(() => {
    updateSettings({ systemAuthorization: draft });
    showToast('系统授权设置已保存', 'success');
    onClose();
  }, [draft, updateSettings, showToast, onClose]);

  const handleReset = useCallback(() => {
    resetSettings();
    setDraft({ ...settings });
    showToast('已重置为默认值', 'info');
  }, [resetSettings, settings, showToast]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          width: 560,
          height: 620,
          maxHeight: 'none',
          margin: 'auto',
        },
      }}
    >
      {/* Close button — absolute top-right */}
      <IconButton
        size="small"
        onClick={onClose}
        sx={{
          position: 'absolute',
          top: 14,
          right: 14,
          zIndex: 10,
          color: '#6B7280',
          '&:hover': { color: '#111827', backgroundColor: '#F3F4F6' },
        }}
      >
        <CloseIcon sx={{ fontSize: 20 }} />
      </IconButton>

      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', pt: 1 }}>
        {/* Header */}
        <Box sx={{ px: 4, pt: 2, pb: 1 }}>
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', mb: 0.25 }}>
            系统授权
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
            管理系统级安全与隐私权限
          </Typography>
        </Box>

        {/* Divider */}
        <Box sx={{ borderBottom: '1px solid #EDEDED', mx: 4 }} />

        {/* Content */}
        <Box sx={{ flex: 1, px: 4, pt: 2, pb: 2, overflow: 'auto', minWidth: 0 }}>
          <SettingsSystemAuthorization draft={draft} setDraft={setDraft} />
        </Box>

        {/* Footer */}
        <Box sx={{ borderTop: '1px solid #EDEDED', mx: 4 }} />
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', px: 4, py: 2 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={handleReset}
            sx={{
              borderColor: gs.border,
              color: gs.textMuted,
              fontSize: '0.75rem',
              '&:hover': { borderColor: gs.textDisabled },
            }}
          >
            重置
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            sx={{
              backgroundColor: gs.textPrimary,
              '&:hover': { backgroundColor: gs.textSecondary },
              fontSize: '0.75rem',
            }}
          >
            保存
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default SystemAuthorizationDialog;
