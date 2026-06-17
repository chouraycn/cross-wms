/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Button,
  Divider,
  useTheme,
} from '@mui/material';
import type { AppSettings, SidebarConfig } from '../../../contexts/AppSettingsContext';
import { formatVersion, type UpdateStatus } from '../../../services/updateService';
import { useUpdateContext } from '../../../contexts/UpdateContext';
import { switchSx, APP_VERSION } from '../sharedStyles';
import TrafficLightOffsetSection from './TrafficLightOffsetSection';
import { getGrayScale } from '../../../constants/theme';
import { SpinningIcon } from '../../../components/shared/SpinningIcon';

// ===================== Props =====================

export interface AboutTabProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

// ===================== Helpers =====================

/** Update a sidebar config field */
const updateSidebar = (
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>,
  key: keyof SidebarConfig,
  value: SidebarConfig[keyof SidebarConfig],
) => {
  setDraft((prev) => ({
    ...prev,
    sidebar: { ...prev.sidebar, [key]: value },
  }));
};

// ===================== Component =====================

const AboutTab: React.FC<AboutTabProps> = ({
  draft,
  setDraft,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  errors,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setErrors,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // ---- Update check state ----
  const { checkForUpdates: globalCheckForUpdates, updateStatus, showUpdateNotification, downloadUpdate, currentVersion } = useUpdateContext();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [localUpdateStatus, setLocalUpdateStatus] = useState<UpdateStatus | null>(null);
  const effectiveUpdateStatus = showUpdateNotification ? updateStatus : localUpdateStatus;

  // ---- Update check handlers ----

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    setLocalUpdateStatus(null);
    try {
      const result = await globalCheckForUpdates();
      if (!result.hasUpdate) {
        setLocalUpdateStatus(result);
      }
      if (result.error) {
        console.warn('检查更新失败:', result.error);
        setLocalUpdateStatus(result);
      }
    } catch (err) {
      const errorStatus: UpdateStatus = {
        hasUpdate: false,
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        error: err instanceof Error ? err.message : '检查更新失败',
      };
      setLocalUpdateStatus(errorStatus);
    } finally {
      setCheckingUpdate(false);
    }
  }, [globalCheckForUpdates]);

  const handleDownloadUpdate = useCallback(() => {
    downloadUpdate();
  }, [downloadUpdate]);

  // ---- Render ----

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* ===== About Section ===== */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 400 }}>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
          关于系统
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: gs.textMuted, fontSize: '0.875rem' }}>系统名称</Typography>
          <Typography sx={{ color: gs.textPrimary, fontSize: '0.875rem', fontWeight: 500 }}>CDF Know Claw</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: gs.textMuted, fontSize: '0.875rem' }}>版本</Typography>
          <Typography sx={{ color: gs.textPrimary, fontSize: '0.875rem', fontWeight: 500 }}>V{currentVersion}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: gs.textMuted, fontSize: '0.875rem' }}>构建日期</Typography>
          <Typography sx={{ color: gs.textPrimary, fontSize: '0.875rem', fontWeight: 500 }}>
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: gs.textMuted, fontSize: '0.875rem' }}>运行环境</Typography>
          <Typography sx={{ color: gs.textPrimary, fontSize: '0.875rem', fontWeight: 500 }}>
            {window.electronAPI ? 'Electron 桌面应用' : '浏览器'}
          </Typography>
        </Box>

        {/* Auto-update area */}
        <Box sx={{ mt: 1, mb: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            startIcon={checkingUpdate ? <SpinningIcon spinning={checkingUpdate}><Box component="span" sx={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${gs.textDisabled}`, borderTopColor: 'transparent' }} /></SpinningIcon> : undefined}
            sx={{
              borderColor: gs.border,
              color: gs.textMuted,
              fontSize: '0.8rem',
              '&:hover': { borderColor: gs.borderDarker, backgroundColor: gs.bgHover },
            }}
          >
            {checkingUpdate ? '检查中...' : effectiveUpdateStatus ? '重新检查更新' : '检查更新'}
          </Button>

          {effectiveUpdateStatus && !effectiveUpdateStatus.error && (
            <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, backgroundColor: effectiveUpdateStatus.hasUpdate ? '#FFF7ED' : gs.bgHover, border: `1px solid ${effectiveUpdateStatus.hasUpdate ? '#FDBA74' : gs.border}` }}>
              {effectiveUpdateStatus.hasUpdate && effectiveUpdateStatus.releaseInfo ? (
                <Box>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#9A3412', mb: 0.5 }}>
                    发现新版本 V{formatVersion(effectiveUpdateStatus.latestVersion)}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#9A3412', mb: 1, whiteSpace: 'pre-wrap' }}>
                    {effectiveUpdateStatus.releaseInfo.notes}
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: '#B45309', mb: 1 }}>
                    发布时间：{effectiveUpdateStatus.releaseInfo.pubDate}
                  </Typography>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleDownloadUpdate}
                    sx={{
                      backgroundColor: '#9A3412',
                      '&:hover': { backgroundColor: '#7C2D12' },
                      fontSize: '0.8rem',
                    }}
                  >
                    下载最新版本
                  </Button>
                </Box>
              ) : (
                <Typography sx={{ fontSize: '0.8rem', color: gs.textMuted }}>
                  ✓ 当前已是最新版本
                </Typography>
              )}
            </Box>
          )}

          {effectiveUpdateStatus?.error && (
            <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5' }}>
              <Typography sx={{ fontSize: '0.8rem', color: '#991B1B' }}>
                检查更新失败：{effectiveUpdateStatus.error}
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: '#991B1B', mt: 0.5 }}>
                请确保应用可以访问互联网，或联系管理员获取最新版本
              </Typography>
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* Sidebar settings */}
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: gs.textPrimary, mt: 0.5 }}>
          侧边栏设置
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={draft.sidebar.showVersion}
              onChange={(e) => updateSidebar(setDraft, 'showVersion', e.target.checked)}
              size="small"
              sx={switchSx}
            />
          }
          label={
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography sx={{ fontSize: '0.875rem', color: gs.textPrimary }}>显示版本号</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled }}>
                在侧边栏 Logo 旁显示当前版本号（v{currentVersion}）
              </Typography>
            </Box>
          }
        />

        <Divider sx={{ my: 1.5 }} />

        {/* Traffic light offset (macOS pywebview only) */}
        <TrafficLightOffsetSection />
      </Box>
    </Box>
  );
};

export default AboutTab;
