import React, { useState, useEffect, useRef } from 'react';
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
import StorageIcon from '@mui/icons-material/Storage';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import MemoryIcon from '@mui/icons-material/Memory';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import TimerIcon from '@mui/icons-material/Timer';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import WebhookIcon from '@mui/icons-material/Webhook';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import GitHubIcon from '@mui/icons-material/GitHub';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import PublicIcon from '@mui/icons-material/Public';
import BookOutlinedIcon from '@mui/icons-material/BookOutlined';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FindInPageOutlinedIcon from '@mui/icons-material/FindInPageOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import type { AppSettings } from '../../contexts/AppSettingsContext';
import { getGrayScale } from '../../constants/theme';
import { APP_VERSION } from './appVersion';
import SettingsGeneral from './SettingsGeneral';
import SettingsAbout from './SettingsAbout';
import { useToast } from '../../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';

const SIDEBAR_WIDTH_EXPANDED = 360;

// 已移除的 Tab（迁移到 AI 对话 / Skill 体系 / Swift 原生）：
// - tencentDocs: 腾讯文档配置 → 通过腾讯文档 Skill 实现（功能页 /tencent-docs 仍保留）
// - dashboardCalc: 仪表盘参数 → 通过 AI 对话分析仪表盘
// - dashboardIndicators: 指标控制 → 通过 Skill 配置指标维度
// - systemAuthorization: 系统授权 → Swift 原生 App 内置权限管理，Web 端无需配置（状态已移除）

/** 设置详情视图可用的 tab（仅这些走内联详情视图；其余走 navigate / dialog） */
type SettingsTab = 'menu' | 'appearance' | 'about';

/** 菜单条目：带 children 即为可展开分组 */
export interface MenuEntry {
  key: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  children?: MenuEntry[];
  // 叶子动作（无 children 时生效）
  tab?: SettingsTab;
  path?: string;
  dialog?: 'tool' | 'model';
  appearanceInline?: boolean;
  // 打开 AISettingsDialog 并定位到指定标签页
  aiTab?: { main: string; sub: string };
}

export const SETTINGS_MENU: MenuEntry[] = [
  { key: 'appearance', label: '外观', icon: <PaletteOutlinedIcon sx={{ fontSize: 20 }} />, description: '主题、颜色与显示偏好', appearanceInline: true },
  { key: 'modelManagement', label: '模型管理', icon: <AutoAwesomeIcon sx={{ fontSize: 20 }} />, description: 'AI 模型配置与默认模型', dialog: 'model' },
  { key: 'extensionsCenter', label: '扩展与工具', icon: <ExtensionOutlinedIcon sx={{ fontSize: 20 }} />, description: '插件、扩展与 MCP 工具统一管理', path: '/extensions-center' },
  { key: 'comms', label: '通讯', icon: <RecordVoiceOverIcon sx={{ fontSize: 20 }} />, description: '语音对话与通道配置', aiTab: { main: 'comms', sub: 'talk' } },
  { key: 'observabilityCenter', label: '监控中心', icon: <MonitorHeartIcon sx={{ fontSize: 20 }} />, description: '系统监控、系统指标、审计、执行历史、事件账本与调用历史', path: '/observability-center' },
  { key: 'permissions', label: '权限管理', icon: <SecurityIcon sx={{ fontSize: 20 }} />, description: '屏幕录制、辅助功能、全盘访问等系统权限', path: '/permissions' },
  { key: 'memory', label: '记忆', icon: <StorageIcon sx={{ fontSize: 20 }} />, description: '打开记忆管理页面', path: '/memory' },
  {
    key: 'triggers',
    label: '触发 & 通知',
    icon: <NotificationsActiveOutlinedIcon sx={{ fontSize: 20 }} />,
    description: '触发·关键词·Webhook',
    children: [
      { key: 'triggers-list', label: '触发器', icon: <TimerIcon sx={{ fontSize: 18 }} />, description: '事件触发', path: '/triggers' },
      { key: 'keyword-trigger', label: '关键词触发', icon: <FlashOnIcon sx={{ fontSize: 18 }} />, description: '触发配置', path: '/keyword-trigger' },
      { key: 'webhook', label: 'Webhook', icon: <WebhookIcon sx={{ fontSize: 18 }} />, description: '钩子管理', path: '/webhook' },
    ],
  },
  {
    key: 'devTools',
    label: '开发工具',
    icon: <CodeOutlinedIcon sx={{ fontSize: 20 }} />,
    description: 'Git·索引·LSP·任务',
    children: [
      { key: 'git', label: 'Git 管理', icon: <GitHubIcon sx={{ fontSize: 18 }} />, description: '版本控制', path: '/git' },
      { key: 'code-index', label: '代码索引', icon: <CodeOutlinedIcon sx={{ fontSize: 18 }} />, description: '符号搜索', path: '/code-index' },
      { key: 'lsp', label: 'LSP 服务器', icon: <LanguageOutlinedIcon sx={{ fontSize: 18 }} />, description: '语言服务', path: '/lsp' },
      { key: 'tasks', label: '任务管理', icon: <TaskAltIcon sx={{ fontSize: 18 }} />, description: 'CRUD 管理', path: '/tasks' },
      { key: 'browser-profiles', label: '浏览器配置', icon: <PublicIcon sx={{ fontSize: 18 }} />, description: '浏览器管理', path: '/browser-profiles' },
    ],
  },
  {
    key: 'knowledge',
    label: '知识 & 记忆',
    icon: <BookOutlinedIcon sx={{ fontSize: 20 }} />,
    description: 'Wiki·消息·缓存·文档',
    children: [
      { key: 'wiki', label: 'Wiki 知识库', icon: <BookOutlinedIcon sx={{ fontSize: 18 }} />, description: '知识管理', path: '/wiki' },
      { key: 'message-lifecycle', label: '消息生命周期', icon: <TrackChangesIcon sx={{ fontSize: 18 }} />, description: '生命周期监控', path: '/message-lifecycle' },
      { key: 'cache-manager', label: '缓存管理', icon: <StorageIcon sx={{ fontSize: 18 }} />, description: '缓存管理', path: '/cache-manager' },
      { key: 'tencent-docs', label: '腾讯文档', icon: <DescriptionOutlinedIcon sx={{ fontSize: 18 }} />, description: '在线文档', path: '/tencent-docs' },
    ],
  },
  {
    key: 'wms',
    label: '仓储管理',
    icon: <WarehouseOutlinedIcon sx={{ fontSize: 20 }} />,
    description: '仓库·在途·库存',
    children: [
      { key: 'dashboard', label: '仪表盘', icon: <DashboardOutlinedIcon sx={{ fontSize: 18 }} />, description: '总览', path: '/dashboard' },
      { key: 'warehouses', label: '仓库管理', icon: <FolderOutlinedIcon sx={{ fontSize: 18 }} />, description: '仓库列表', path: '/warehouses' },
      { key: 'partners', label: '客商管理', icon: <GroupsOutlinedIcon sx={{ fontSize: 18 }} />, description: '供应商 & 客户', path: '/partners' },
      { key: 'in-transit', label: '在途管理', icon: <LocalShippingOutlinedIcon sx={{ fontSize: 18 }} />, description: '在途跟踪', path: '/in-transit' },
      { key: 'inventory', label: '库存管理', icon: <InventoryOutlinedIcon sx={{ fontSize: 18 }} />, description: '库存查询', path: '/inventory' },
      { key: 'transfer', label: '仓库调拨', icon: <SwapHorizIcon sx={{ fontSize: 18 }} />, description: '多仓调拨', path: '/transfer' },
      { key: 'inventory-transactions', label: '库存交易', icon: <ArrowUpwardIcon sx={{ fontSize: 18 }} />, description: '流水记录', path: '/inventory-transactions' },
      { key: 'wms-quality', label: '入库质检', icon: <FactCheckOutlinedIcon sx={{ fontSize: 18 }} />, description: '质检管理', path: '/wms/quality' },
      { key: 'wms-inventory', label: '库存盘点', icon: <FindInPageOutlinedIcon sx={{ fontSize: 18 }} />, description: '盘点管理', path: '/wms/inventory' },
      { key: 'wms-outbound', label: '出库复核', icon: <VerifiedUserOutlinedIcon sx={{ fontSize: 18 }} />, description: '复核管理', path: '/wms/outbound' },
      { key: 'wms-alerts', label: '预警 & 补货', icon: <NotificationsActiveOutlinedIcon sx={{ fontSize: 18 }} />, description: '预警中心 & 智能补货', path: '/wms/alerts' },
      { key: 'reports', label: '报表', icon: <AssessmentOutlinedIcon sx={{ fontSize: 18 }} />, description: '数据报表 & 报表中心', path: '/reports' },
    ],
  },
  { key: 'about', label: '关于', icon: <InfoIcon sx={{ fontSize: 20 }} />, description: '系统信息与版本', tab: 'about' },
];

// 详情视图标题查找表（含子项）
const LABEL_BY_KEY: Record<string, string> = {};
SETTINGS_MENU.forEach((e) => {
  LABEL_BY_KEY[e.key] = e.label;
  if (e.children) e.children.forEach((c) => { LABEL_BY_KEY[c.key] = c.label; });
});

const SettingsPanel: React.FC<{ onClose?: () => void; onOpenModelManagement?: () => void; onOpenToolManagement?: () => void; onOpenAITab?: (main: string, sub: string) => void }> = ({ onClose, onOpenModelManagement, onOpenToolManagement, onOpenAITab }) => {
  const { settings, updateSettings, resetSettings } = useAppSettings();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const textPrimary = gs.textPrimary;
  const textMuted = gs.textMuted;

  const [activeTab, setActiveTab] = useState<SettingsTab>('menu');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleSave = () => {
    updateSettings({ sidebar: draft.sidebar }); updateSettings({ appearance: draft.appearance });
    showToast('设置已保存', 'success');
  };
  const handleReset = () => { resetSettings(); setDraft({ ...settings }); setErrors({}); showToast('已重置为默认值', 'info'); };

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
          display: 'flex', alignItems: 'center', gap: 1.5,
          px: indent ? 3 : 2, py: 1.5,
          cursor: isAppearance ? 'default' : 'pointer',
          borderRadius: '8px',
          '&:hover': { backgroundColor: isAppearance ? 'transparent' : gs.bgHover },
        }}
      >
        <Box sx={{ color: gs.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 20 }}>
          {entry.icon || (indent ? <FiberManualRecordIcon sx={{ fontSize: 8 }} /> : null)}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: indent ? '0.78rem' : '0.8125rem', fontWeight: 500, color: gs.textPrimary }}>{entry.label}</Typography>
          {entry.description && <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.description}</Typography>}
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
            {SETTINGS_MENU.map((entry) => {
              if (entry.children) {
                const expanded = expandedGroup === entry.key;
                const hasAiTab = !!entry.aiTab;
                return (
                  <Box key={entry.key}>
                    <Box
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderRadius: '8px',
                        '&:hover': { backgroundColor: gs.bgHover },
                      }}
                    >
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0, cursor: 'pointer' }}
                        onClick={() => { if (hasAiTab) handleLeafClick(entry); }}
                      >
                        <Box sx={{ color: gs.textMuted, display: 'flex', alignItems: 'center' }}>{entry.icon}</Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: gs.textPrimary }}>{entry.label}</Typography>
                          <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.description}</Typography>
                        </Box>
                      </Box>
                      <ExpandMoreIcon
                        onClick={() => setExpandedGroup(expanded ? null : entry.key)}
                        sx={{ fontSize: 18, color: gs.textMuted, transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', cursor: 'pointer' }}
                      />
                    </Box>
                    {expanded && entry.children.map((child) => renderLeaf(child, true))}
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
        {/* 仅 appearance/about 显示底部保存/重置按钮 */}
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

export interface SettingsPopoverProps { open: boolean; onClose: () => void; anchorEl: HTMLElement | null; onOpenModelManagement?: () => void; onOpenToolManagement?: () => void; onOpenAITab?: (main: string, sub: string) => void; }

const SettingsPopover: React.FC<SettingsPopoverProps> = ({ open, onClose, anchorEl, onOpenModelManagement, onOpenToolManagement, onOpenAITab }) => {
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
      <SettingsPanel onClose={onClose} onOpenModelManagement={onOpenModelManagement} onOpenToolManagement={onOpenToolManagement} onOpenAITab={onOpenAITab} />
    </Popover>
  );
};

export default SettingsPopover;
