import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Divider, IconButton, Popover, Grow, Button, useTheme } from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import type { AppSettings } from '../../contexts/AppSettingsContext';
import { getGrayScale } from '../../constants/theme';
import { APP_VERSION } from './appVersion';
import SettingsGeneral from './SettingsGeneral';
import SettingsAbout from './SettingsAbout';
import { useToast, ToastMessages } from '../../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
// StaffDeck 程序化图标（currentColor 主题化，与设置面板文字色联动）
import StaffdeckIcon from '../staff/StaffdeckIcon';
import { MenuEntry, SETTINGS_MENU } from './settingsMenuData.tsx';

/** 设置详情视图可用的 tab（仅这些走内联详情视图；其余走 navigate / dialog） */
type SettingsTab = 'menu' | 'appearance' | 'about';

const SIDEBAR_WIDTH_EXPANDED = 360;

// 详情视图标题查找表（含子项）
const LABEL_BY_KEY: Record<string, string> = {};
SETTINGS_MENU.forEach((e) => {
  LABEL_BY_KEY[e.key] = e.label;
  if (e.children) e.children.forEach((c) => { LABEL_BY_KEY[c.key] = c.label; });
});

const SettingsPanel: React.FC<{ onClose?: () => void; onOpenModelManagement?: () => void; onOpenToolManagement?: () => void; onOpenAITab?: (main: string, sub: string) => void; onOpenGroups?: (groupKey: string) => void }> = ({ onClose, onOpenModelManagement, onOpenToolManagement, onOpenAITab, onOpenGroups }) => {
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

  const handleSave = () => {
    updateSettings({ sidebar: draft.sidebar }); updateSettings({ appearance: draft.appearance });
    showToast('设置已保存', 'success');
  };
  const handleReset = () => { resetSettings(); setDraft({ ...settings }); setErrors({}); showToast(ToastMessages.RESET_TO_DEFAULT, 'info'); };

  const hasErrors = Object.keys(errors).length > 0;
  const currentLabel = LABEL_BY_KEY[activeTab];

  const handleLeafClick = (entry: MenuEntry) => {
    if (entry.aiTab) { onClose?.(); onOpenAITab?.(entry.aiTab.main, entry.aiTab.sub); }
    else if (entry.dialog === 'tool') { onClose?.(); onOpenToolManagement?.(); }
    else if (entry.dialog === 'model') { onClose?.(); onOpenModelManagement?.(); }
    else if (entry.path) { onClose?.(); navigate(entry.path); }
    else if (entry.tab) { setActiveTab(entry.tab); }
  };

  const renderLeaf = (entry: MenuEntry, indent = false) => {
    const isAppearance = entry.appearanceInline === true;
    return (
      <Box
        key={entry.key}
        onClick={() => { if (!isAppearance) handleLeafClick(entry); }}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.25,
          px: indent ? 2.5 : 1.5, py: 0.75,
          cursor: isAppearance ? 'default' : 'pointer',
          borderRadius: '8px',
          '&:hover': { backgroundColor: isAppearance ? 'transparent' : gs.bgHover },
        }}
      >
        <Box sx={{ color: gs.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 18 }}>
          {entry.icon || (indent ? <FiberManualRecordIcon sx={{ fontSize: 7 }} /> : null)}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: indent ? '0.77rem' : '0.8rem', fontWeight: 500, color: gs.textPrimary }}>{entry.label}</Typography>
          {entry.description && <Typography sx={{ fontSize: '0.68rem', color: gs.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.description}</Typography>}
        </Box>
        {/* 外观项：胶囊按钮切换浅色/深色 */}
        {isAppearance && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }} onClick={e => e.stopPropagation()}>
            <Box
              onClick={() => {
                const newMode = 'light' as const;
                setDraft(prev => ({ ...prev, appearance: { ...prev.appearance, themeMode: newMode } }));
                updateSettings({ appearance: { ...draft.appearance, themeMode: newMode } });
              }}
              sx={{
                px: 1.5, py: 0.4, borderRadius: '12px 0 0 12px', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                backgroundColor: draft.appearance.themeMode === 'light' ? gs.bgPanel : gs.bgHover,
                color: draft.appearance.themeMode === 'light' ? gs.textPrimary : gs.textDisabled,
                border: `1px solid ${gs.border}`, borderRight: 'none',
                boxShadow: draft.appearance.themeMode === 'light' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              浅色
            </Box>
            <Box
              onClick={() => {
                const newMode = 'dark' as const;
                setDraft(prev => ({ ...prev, appearance: { ...prev.appearance, themeMode: newMode } }));
                updateSettings({ appearance: { ...draft.appearance, themeMode: newMode } });
              }}
              sx={{
                px: 1.5, py: 0.4, borderRadius: '0 12px 12px 0', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                backgroundColor: draft.appearance.themeMode === 'dark' ? gs.bgPanel : gs.bgHover,
                color: draft.appearance.themeMode === 'dark' ? gs.textPrimary : gs.textDisabled,
                border: `1px solid ${gs.border}`, borderLeft: 'none',
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
  };

  // ---- Menu view ----
  if (activeTab === 'menu') {
    return (
      <Box className="settings-panel" sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', color: textPrimary }}>
          <Box sx={{ px: 1.5, pt: 1, pb: 0.75, display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <g fill={gs.textPrimary}>
                  <path d="M93.45,36.53l-11.5,16.57,10.03,14.41c2.25-5.4,3.5-11.32,3.5-17.53,0-4.68-.71-9.2-2.02-13.45Z" />
                  <path d="M57.48,88.15c-2.65.57-5.4.88-8.23.88-6.04,0-11.77-1.37-16.88-3.83V18.56c0-2.38,1.47-4.54,3.71-5.34,4.11-1.47,8.55-2.28,13.17-2.28.91,0,1.81.03,2.71.1v44.36c0,2.49,3.21,3.5,4.64,1.45l26.5-38.08c-7.87-8.37-18.87-13.77-31.13-14.32v.03c-.9-.05-1.8-.08-2.71-.08C24.07,4.39,3.66,24.8,3.66,49.99s20.41,45.59,45.59,45.59c1.04,0,2.07-.04,3.09-.11l-.03.04c10.67-.56,20.36-4.8,27.85-11.46l-6.65-9.55c-1.56-2.25-4.89-2.25-6.46-.01l-9.57,13.65Z" />
                </g>
              </svg>
            </Box>
            <Box><Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: textPrimary, lineHeight: 1.25 }}>CDF Know Claw</Typography><Typography sx={{ fontSize: '0.68rem', color: textMuted }}>v{APP_VERSION}</Typography></Box>
          </Box>
          <Divider sx={{ mb: 0.5 }} />
          <Box sx={{ px: 1, pb: 0.75, flex: 1, overflow: 'auto', minHeight: 0 }}>
            {SETTINGS_MENU.map((entry) => {
              if (entry.children) {
                return (
                  <Box
                    key={entry.key}
                    onClick={() => { onClose?.(); onOpenGroups?.(entry.key); }}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 0.75, borderRadius: '8px',
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: gs.bgHover },
                    }}
                  >
                    <Box sx={{ color: gs.textMuted, display: 'flex', alignItems: 'center' }}>{entry.icon}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: gs.textPrimary }}>{entry.label}</Typography>
                      <Typography sx={{ fontSize: '0.68rem', color: gs.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.description}</Typography>
                    </Box>
                  </Box>
                );
              }
              return renderLeaf(entry);
            })}
          </Box>
        </Box>
    );
  }

  // ---- Detail view — delegate to sub-components ----
  return (
    <Box className="settings-panel" sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', color: textPrimary }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, pt: 0.75, pb: 0.5 }}>
        <IconButton size="small" onClick={() => setActiveTab('menu')} sx={{ color: gs.textMuted }}><StaffdeckIcon name="arrow" sx={{ fontSize: 16 }} rotate={180} /></IconButton>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, flex: 1 }}>{currentLabel}</Typography>
        <IconButton size="small" onClick={() => onClose?.()} sx={{ color: gs.textMuted, '&:hover': { color: gs.textPrimary } }}><StaffdeckIcon name="close" sx={{ fontSize: 16 }} /></IconButton>
      </Box>
      <Divider sx={{ mb: 0.5 }} />
      <Box sx={{ px: 1.5, pb: 0.75, flex: 1, overflow: 'auto', minHeight: 0 }}>
        {activeTab === 'appearance' && <SettingsGeneral draft={draft} setDraft={setDraft} />}
        {activeTab === 'about' && <SettingsAbout draft={draft} setDraft={setDraft} />}
        {/* 仅 appearance/about 显示底部保存/重置按钮 */}
        {(activeTab === 'appearance' || activeTab === 'about') && (
          <>
            <Divider sx={{ mt: 1, mb: 0.75 }} />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button variant="outlined" size="small" startIcon={<StaffdeckIcon name="refresh" />} onClick={handleReset} sx={{ borderColor: gs.border, color: gs.textMuted, fontSize: '0.72rem', '&:hover': { borderColor: gs.textDisabled } }}>重置</Button>
              <Button variant="contained" size="small" startIcon={<StaffdeckIcon name="save" />} onClick={handleSave} disabled={hasErrors} sx={{ backgroundColor: gs.textPrimary, '&:hover': { backgroundColor: gs.textSecondary }, fontSize: '0.72rem', '&.Mui-disabled': { backgroundColor: gs.border, color: gs.textDisabled } }}>保存</Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export interface SettingsPopoverProps { open: boolean; onClose: () => void; anchorEl: HTMLElement | null; onOpenModelManagement?: () => void; onOpenToolManagement?: () => void; onOpenAITab?: (main: string, sub: string) => void; onOpenGroups?: (groupKey: string) => void; }

const SettingsPopover: React.FC<SettingsPopoverProps> = ({ open, onClose, anchorEl, onOpenModelManagement, onOpenToolManagement, onOpenAITab, onOpenGroups }) => {
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
      sx={{ zIndex: 1700 }}
      slotProps={{
        paper: {
          sx: { width: SIDEBAR_WIDTH_EXPANDED, maxHeight: '95vh', minHeight: 'fit-content', borderRadius: '12px', marginLeft: '-5px', boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.15)', border: `1px solid ${gs.border}`, overflow: 'hidden' },
        },
      }}
      hideBackdrop
    >
      <SettingsPanel onClose={onClose} onOpenModelManagement={onOpenModelManagement} onOpenToolManagement={onOpenToolManagement} onOpenAITab={onOpenAITab} onOpenGroups={onOpenGroups} />
    </Popover>
  );
};

export default SettingsPopover;
