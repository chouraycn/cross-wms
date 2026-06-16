import React, { useState } from 'react';
import {
  Box, Typography, IconButton,
  Dialog, Alert, Button, CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { useModels } from '../../contexts/ModelsContext';
import ModelManager from '../shared/ModelManager';
import SystemAuthBanner from './SystemAuthBanner';

/* ------------------------------------------------------------------ */
/*  Sidebar tabs                                                        */
/* ------------------------------------------------------------------ */
type AITab = 'mcp' | 'model' | 'chat' | 'auth';

interface TabDef {
  key: AITab;
  label: string;
  icon: React.ReactNode;
}

const SIDEBAR_TABS: TabDef[] = [
  { key: 'mcp', label: 'MCP', icon: <LinkIcon sx={{ fontSize: 17 }} /> },
  { key: 'model', label: '模型', icon: <FormatListBulletedIcon sx={{ fontSize: 17 }} /> },
  { key: 'chat', label: '对话', icon: <ChatOutlinedIcon sx={{ fontSize: 17 }} /> },
  { key: 'auth', label: '外部应用授权', icon: <VpnKeyOutlinedIcon sx={{ fontSize: 17 }} /> },
];

/* ------------------------------------------------------------------ */
/*  Placeholder tab content                                             */
/* ------------------------------------------------------------------ */
const PlaceholderTab: React.FC<{ title: string; description?: string }> = ({ title, description }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', mb: 0.5 }}>{title}</Typography>
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF' }}>
        {description || '功能开发中，敬请期待'}
      </Typography>
    </Box>
  </Box>
);

/* ------------------------------------------------------------------ */
/*  Main Dialog                                                         */
/* ------------------------------------------------------------------ */
export interface AISettingsDialogProps {
  open: boolean;
  onClose: () => void;
  /** 当用户点击「前往设置」时，打开系统授权配置 */
  onOpenSystemAuthorization?: () => void;
}

const AISettingsDialog: React.FC<AISettingsDialogProps> = ({ open, onClose, onOpenSystemAuthorization }) => {
  const [activeTab, setActiveTab] = useState<AITab>('model');
  const { settings, updateSettings } = useAppSettings();
  const { models: modelList, defaultModelId, updateModels, isLoading, error, reload } = useModels();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          width: 880,
          height: 580,
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

      <Box sx={{ display: 'flex', height: '100%', pt: 0.5 }}>
        {/* Left sidebar — strict match to screenshot */}
        <Box
          sx={{
            width: 156,
            borderRight: '1px solid #EDEDED',
            backgroundColor: '#F5F5F5',
            py: 2,
            px: 1.25,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.125,
            flexShrink: 0,
          }}
        >
          {SIDEBAR_TABS.map(tab => {
            const isSelected = activeTab === tab.key;
            return (
              <Box
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  px: 1.25,
                  py: 1,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                  backgroundColor: isSelected ? '#ECECEC' : 'transparent',
                  color: isSelected ? '#1F2937' : '#6B7280',
                  '&:hover': {
                    backgroundColor: isSelected ? '#ECECEC' : '#EBEBEB',
                    color: '#1F2937',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', opacity: isSelected ? 1 : 0.55 }}>{tab.icon}</Box>
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: isSelected ? 500 : 400, letterSpacing: '-0.01em' }}>{tab.label}</Typography>
              </Box>
            );
          })}
        </Box>

        {/* Right content area */}
        <Box sx={{ flex: 1, px: 4, pt: 3, pr: 5, pb: 4, overflow: 'auto', minWidth: 0, position: 'relative' }}>
          {activeTab === 'model' && (
            <>
              <SystemAuthBanner onOpenSettings={onOpenSystemAuthorization} />
              {isLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4, gap: 1 }}>
                  <CircularProgress size={20} />
                  <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>正在加载模型配置...</Typography>
                </Box>
              )}
              {error && (
                <Alert
                  severity="error"
                  sx={{ mb: 2, borderRadius: 1.5 }}
                  action={
                    <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={() => reload()}>
                      重试
                    </Button>
                  }
                >
                  加载模型配置失败：{error}
                </Alert>
              )}
              {!isLoading && !error && (
                <ModelManager
                  models={modelList}
                  defaultModelId={defaultModelId}
                  variant="table"
                  onChange={(models, newDefaultModelId) => updateModels(models, newDefaultModelId)}
                />
              )}
            </>
          )}
          {activeTab === 'mcp' && <PlaceholderTab title="MCP" description="MCP Server 配置功能开发中，敬请期待" />}
          {activeTab === 'chat' && <PlaceholderTab title="对话" description="对话设置功能开发中，敬请期待" />}
          {activeTab === 'auth' && <PlaceholderTab title="外部应用授权" description="外部应用授权管理功能开发中，敬请期待" />}
        </Box>
      </Box>
    </Dialog>
  );
};

export default AISettingsDialog;
