import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Typography, Divider, IconButton, Popover, Grow, Button, useTheme } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import InfoIcon from '@mui/icons-material/Info';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import SecurityIcon from '@mui/icons-material/Security';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import CableIcon from '@mui/icons-material/Cable';
import StorageIcon from '@mui/icons-material/Storage';
import HubIcon from '@mui/icons-material/Hub';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import AssessmentIcon from '@mui/icons-material/Assessment';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import type { AppSettings } from '../../contexts/AppSettingsContext';
import { isPyWebView } from '../../services/tencentDocsApi';
import { API_BASE } from '../../constants/api';
import { getGrayScale } from '../../constants/theme';
import { APP_VERSION } from '../Settings/sharedStyles';
import SettingsGeneral from './SettingsGeneral';
import SettingsAbout from './SettingsAbout';
import TalkSettingsPanel from '../Talk/TalkSettingsPanel';
import ChannelManagerPanel from '../Channel/ChannelManagerPanel';
import { useToast } from '../../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';

const SIDEBAR_WIDTH_EXPANDED = 360;
// 已移除的 Tab（迁移到 AI 对话 / Skill 体系 / Swift 原生）：
// - tencentDocs: 腾讯文档配置 → 通过腾讯文档 Skill 实现
// - dashboardCalc: 仪表盘参数 → 通过 AI 对话分析仪表盘
// - dashboardIndicators: 指标控制 → 通过 Skill 配置指标维度
// - systemAuthorization: 系统授权 → Swift 原生 App 内置权限管理，Web 端无需配置
type SettingsTab = 'menu' | 'modelManagement' | 'toolManagement' | 'extensions' | 'monitor' | 'audit' | 'apiKeys' | 'appearance' | 'about' | 'talk' | 'channels' | 'memory';
interface SettingsMenuItem { key: Exclude<SettingsTab, 'menu'>; label: string; icon: React.ReactNode; description: string; }
const SETTINGS_MENU_ITEMS: SettingsMenuItem[] = [
  { key: 'appearance', label: '外观', icon: <PaletteOutlinedIcon sx={{ fontSize: 20 }} />, description: '主题、颜色与显示偏好' },
  { key: 'modelManagement', label: '模型管理', icon: <AutoAwesomeIcon sx={{ fontSize: 20 }} />, description: 'AI 模型配置与默认模型' },
  { key: 'toolManagement', label: '工具管理', icon: <ExtensionOutlinedIcon sx={{ fontSize: 20 }} />, description: '插件、API 模板、浏览器等工具' },
  { key: 'extensions', label: '扩展管理', icon: <HubIcon sx={{ fontSize: 20 }} />, description: '扩展的启用、禁用与加载' },
  { key: 'monitor', label: '系统监控', icon: <MonitorHeartIcon sx={{ fontSize: 20 }} />, description: '插件、扩展、消息等系统指标' },
  { key: 'audit', label: '审计日志', icon: <AssessmentIcon sx={{ fontSize: 20 }} />, description: '消息审计与操作记录' },
  { key: 'apiKeys', label: 'API Key', icon: <VpnKeyIcon sx={{ fontSize: 20 }} />, description: 'API Key 创建与管理' },
  { key: 'talk', label: '语音对话', icon: <RecordVoiceOverIcon sx={{ fontSize: 20 }} />, description: '语音 locale、静默超时、思考级别' },
  { key: 'channels', label: '通道管理', icon: <CableIcon sx={{ fontSize: 20 }} />, description: '飞书/钉钉/Slack/Telegram 等通道配置' },
  { key: 'memory', label: '记忆', icon: <StorageIcon sx={{ fontSize: 20 }} />, description: '打开记忆管理页面' },
  { key: 'about', label: '关于', icon: <InfoIcon sx={{ fontSize: 20 }} />, description: '系统信息与版本' },
];

const SettingsPanel: React.FC<{ onClose?: () => void; onOpenModelManagement?: () => void; onOpenToolManagement?: () => void }> = ({ onClose, onOpenModelManagement, onOpenToolManagement }) => {
  const { settings, updateSettings, resetSettings } = useAppSettings();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const textPrimary = gs.textPrimary;
  const textMuted = gs.textMuted;

  const [activeTab, setActiveTab] = useState<SettingsTab>('menu');
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    setDraft((prev) => (prev.tencentDocs !== settings.tencentDocs ? { ...prev, tencentDocs: { ...settings.tencentDocs } } : prev));
  }, [settings.tencentDocs]);

  const handleSave = () => {
    updateSettings({ sidebar: draft.sidebar }); updateSettings({ appearance: draft.appearance });
    showToast('设置已保存', 'success');
  };
  const handleReset = () => { resetSettings(); setDraft({ ...settings }); setErrors({}); showToast('已重置为默认值', 'info'); };

  /** 打开 Swift 原生权限管理窗口（仅 pywebview 环境） */
  const handleOpenPermissionManager = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/permissions/open-manager`, { method: 'POST' });
      if (!res.ok) { showToast('打开授权管理失败', 'error'); return; }
      onClose?.();
    } catch {
      showToast('原生 App 未运行，无法打开授权管理', 'error');
    }
  }, [showToast, onClose]);

  const hasErrors = Object.keys(errors).length > 0;
  const currentLabel = SETTINGS_MENU_ITEMS.find((i) => i.key === activeTab)?.label;

  // ---- Menu view ----
  if (activeTab === 'menu') {
    return (
      <Box className="settings-panel" sx={{ width: '100%', color: textPrimary }}>
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="24" height="24" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <g fill={gs.textPrimary}>
                  <path d="M93.45,36.53l-11.5,16.57,10.03,14.41c2.25-5.4,3.5-11.32,3.5-17.53,0-4.68-.71-9.2-2.02-13.45Z" />
                  <path d="M57.48,88.15c-2.65.57-5.4.88-8.23.88-6.04,0-11.77-1.37-16.88-3.83V18.56c0-2.38,1.47-4.54,3.71-5.34,4.11-1.47,8.55-2.28,13.17-2.28.91,0,1.81.03,2.71.1v44.36c0,2.49,3.21,3.5,4.64,1.45l26.5-38.08c-7.87-8.37-18.87-13.77-31.13-14.32v.03c-.9-.05-1.8-.08-2.71-.08C24.07,4.39,3.66,24.8,3.66,49.99s20.41,45.59,45.59,45.59c1.04,0,2.07-.04,3.09-.11l-.03.04c10.67-.56,20.36-4.8,27.85-11.46l-6.65-9.55c-1.56-2.25-4.89-2.25-6.46-.01l-9.57,13.65Z" />
                </g>
              </svg>
            </Box>
            <Box><Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: textPrimary, lineHeight: 1.3 }}>CDF Know Claw</Typography><Typography sx={{ fontSize: '0.7rem', color: textMuted }}>v{APP_VERSION}</Typography></Box>
          </Box>
          <Divider sx={{ mb: 1 }} />
          <Box sx={{ px: 2, pb: 2, flex: 1, overflow: 'auto', minHeight: 0 }}>
            {SETTINGS_MENU_ITEMS.map((item) => {
              const isAppearance = item.key === 'appearance';
              return (
                <Box
                  key={item.key}
                  onClick={() => {
                    if (item.key === 'modelManagement') { onClose?.(); onOpenModelManagement?.(); }
                    else if (item.key === 'toolManagement') { onClose?.(); onOpenToolManagement?.(); }
                    else if (item.key === 'memory') { onClose?.(); navigate('/memory'); }
                    else if (item.key === 'extensions') { onClose?.(); navigate('/extensions'); }
                    else if (item.key === 'monitor') { onClose?.(); navigate('/system-monitor'); }
                    else if (item.key === 'audit') { onClose?.(); navigate('/audit-log'); }
                    else if (item.key === 'apiKeys') { onClose?.(); navigate('/api-keys'); }
                    else if (!isAppearance) { setActiveTab(item.key); }
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1.5,
                    cursor: isAppearance ? 'default' : 'pointer',
                    borderRadius: '8px',
                    '&:hover': { backgroundColor: isAppearance ? 'transparent' : gs.bgHover },
                  }}
                >
                  <Box sx={{ color: gs.textMuted, display: 'flex', alignItems: 'center' }}>{item.icon}</Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: gs.textPrimary }}>{item.label}</Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>{item.description}</Typography>
                  </Box>
                  {/* 外观项：胶囊按钮切换浅色/深色 */}
                  {isAppearance && (
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 0 }}
                      onClick={e => e.stopPropagation()}
                    >
                      <Box
                        onClick={() => {
                          const newMode = 'light' as const;
                          setDraft(prev => ({
                            ...prev,
                            appearance: { ...prev.appearance, themeMode: newMode },
                          }));
                          updateSettings({ appearance: { ...draft.appearance, themeMode: newMode } });
                        }}
                        sx={{
                          px: 1.5,
                          py: 0.4,
                          borderRadius: '12px 0 0 12px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          backgroundColor: draft.appearance.themeMode === 'light' ? gs.bgPanel : gs.bgHover,
                          color: draft.appearance.themeMode === 'light' ? gs.textPrimary : gs.textDisabled,
                          border: `1px solid ${gs.border}`,
                          borderRight: 'none',
                          boxShadow: draft.appearance.themeMode === 'light' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        浅色
                      </Box>
                      <Box
                        onClick={() => {
                          const newMode = 'dark' as const;
                          setDraft(prev => ({
                            ...prev,
                            appearance: { ...prev.appearance, themeMode: newMode },
                          }));
                          updateSettings({ appearance: { ...draft.appearance, themeMode: newMode } });
                        }}
                        sx={{
                          px: 1.5,
                          py: 0.4,
                          borderRadius: '0 12px 12px 0',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          backgroundColor: draft.appearance.themeMode === 'dark' ? gs.bgPanel : gs.bgHover,
                          color: draft.appearance.themeMode === 'dark' ? gs.textPrimary : gs.textDisabled,
                          border: `1px solid ${gs.border}`,
                          borderLeft: 'none',
                          boxShadow: draft.appearance.themeMode === 'dark' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        深色
                      </Box>
                    </Box>
                  )}
                </Box>
              );
            })}
            {/* 系统授权管理 — 仅原生 App 模式显示，通过 IPC 调用 Swift 原生权限管理窗口 */}
            {isPyWebView() && (
              <Box
                onClick={handleOpenPermissionManager}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1.5,
                  cursor: 'pointer',
                  borderRadius: '8px',
                  '&:hover': { backgroundColor: gs.bgHover },
                }}
              >
                <Box sx={{ color: gs.textMuted, display: 'flex', alignItems: 'center' }}><SecurityIcon sx={{ fontSize: 20 }} /></Box>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: gs.textPrimary }}>系统授权</Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>打开 macOS 原生权限管理窗口</Typography>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
    );
  }

  // ---- Detail view — delegate to sub-components ----
  return (
    <Box className="settings-panel" sx={{ width: '100%', color: textPrimary }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 2, pb: 1 }}>
        <IconButton size="small" onClick={() => setActiveTab('menu')} sx={{ color: gs.textMuted }}><ArrowBackIcon sx={{ fontSize: 18 }} /></IconButton>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: gs.textPrimary, flex: 1 }}>{currentLabel}</Typography>
        <IconButton size="small" onClick={() => onClose?.()} sx={{ color: gs.textMuted, '&:hover': { color: gs.textPrimary } }}><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
      </Box>
      <Divider sx={{ mb: 1 }} />
      <Box sx={{ px: 2, pb: 2, flex: 1, overflow: 'auto', minHeight: 0 }}>
        {activeTab === 'appearance' && <SettingsGeneral draft={draft} setDraft={setDraft} />}
        {activeTab === 'about' && <SettingsAbout draft={draft} setDraft={setDraft} />}
        {activeTab === 'talk' && <TalkSettingsPanel />}
        {activeTab === 'channels' && <ChannelManagerPanel />}
        {/* 仅 appearance/about 显示底部保存/重置按钮（talk/channels 自带操作按钮） */}
        {(activeTab === 'appearance' || activeTab === 'about') && (
          <>
            <Divider sx={{ mt: 2, mb: 1.5 }} />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button variant="outlined" size="small" startIcon={<RestartAltIcon />} onClick={handleReset} sx={{ borderColor: gs.border, color: gs.textMuted, fontSize: '0.75rem', '&:hover': { borderColor: gs.textDisabled } }}>重置</Button>
              <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={handleSave} disabled={hasErrors} sx={{ backgroundColor: gs.textPrimary, '&:hover': { backgroundColor: gs.textSecondary }, fontSize: '0.75rem', '&.Mui-disabled': { backgroundColor: gs.border, color: gs.textDisabled } }}>保存</Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export interface SettingsPopoverProps { open: boolean; onClose: () => void; anchorEl: HTMLElement | null; onOpenModelManagement?: () => void; onOpenToolManagement?: () => void; }

const SettingsPopover: React.FC<SettingsPopoverProps> = ({ open, onClose, anchorEl, onOpenModelManagement, onOpenToolManagement }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // 点击弹窗外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 找到当前打开的 Popover paper 元素（通过 class 名匹配）
      const popoverPapers = document.querySelectorAll('.MuiPopover-paper');
      let inside = false;
      popoverPapers.forEach((paper) => {
        if (paper.contains(target)) inside = true;
      });
      // 同时检查 anchorEl（设置按钮本身）
      if (anchorEl && anchorEl.contains(target)) inside = true;
      if (!inside) {
        onClose();
      }
    };
    // 延迟绑定，避免设置按钮的点击事件立即触发关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, onClose, anchorEl]);

  return (
    <Popover ref={popoverRef} open={open} onClose={onClose} anchorEl={anchorEl} anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      TransitionComponent={Grow} TransitionProps={{ timeout: 200 }} disableScrollLock disableEnforceFocus
      slotProps={{
        paper: {
          sx: { width: SIDEBAR_WIDTH_EXPANDED, maxHeight: '70vh', borderRadius: '12px', marginLeft: '-5px', boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.15)', border: `1px solid ${gs.border}`, overflow: 'hidden' },
        },
      }}
      hideBackdrop
    >
      <SettingsPanel onClose={onClose} onOpenModelManagement={onOpenModelManagement} onOpenToolManagement={onOpenToolManagement} />
    </Popover>
  );
};

export default SettingsPopover;
