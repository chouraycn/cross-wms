import React, { useState, useCallback, useRef, useEffect, useMemo, Suspense } from 'react';
import { HashRouter, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box, useTheme } from '@mui/material';
import Sidebar from './components/Layout/Sidebar';
import WarehouseSelector, { ALL_WAREHOUSES } from './components/Dashboard/WarehouseSelector';
import { AppSettingsProvider, useAppSettings } from './contexts/AppSettingsContext';
import type { AppearanceConfig, AccentColor } from './contexts/AppSettingsContext';
import { ModelsProvider } from './contexts/ModelsContext';
import { isPyWebView } from './services/tencentDocsApi';
import { getGrayScale } from './constants/theme';
import { UpdateProvider } from './contexts/UpdateContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import UpdateNotification from './components/UpdateNotification';
import { WindowDragBar } from './components/Layout/WindowDragBar';
import { ChatContainer } from './components/CrossWmsChat/ChatContainer';
import { ChatProvider } from './contexts/ChatContext';
import { ToolPermissionProvider } from './contexts/ToolPermissionContext';
import ErrorBoundary from './components/Common/ErrorBoundary';
import LoadingFallback from './components/Common/LoadingFallback';
import { automationEngine } from './services/automation';

// 从统一配色文件导入
export { PRIMARY, SECONDARY, BORDER, BG_LIGHT, BG_PAGE, WHITE, RADIUS, CHAT_COLORS } from './constants/theme';

// 路由级懒加载 — 按需加载各页面组件，降低首屏加载体积
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const SkillsPage = React.lazy(() => import('./pages/SkillsPage'));
const SkillDetailPage = React.lazy(() => import('./pages/SkillDetailPage'));
const SkillAuditPage = React.lazy(() => import('./pages/SkillAuditPage'));


const WarehousesPage = React.lazy(() => import('./pages/WarehousesPage'));
const PartnersPage = React.lazy(() => import('./pages/PartnersPage'));
const InTransitPage = React.lazy(() => import('./pages/InTransitPage'));
const InventoryPage = React.lazy(() => import('./pages/InventoryPage'));
const TencentDocsPage = React.lazy(() => import('./pages/TencentDocsPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
// /settings 已改为侧边栏弹窗重定向，不再需要全页面 SettingsPage
const AutomationPage = React.lazy(() => import('./pages/AutomationPage'));
const ProjectsPage = React.lazy(() => import('./pages/ProjectsPage'));
const WmsQualityPage = React.lazy(() => import('./pages/WmsQualityPage'));
const WmsInventoryPage = React.lazy(() => import('./pages/WmsInventoryPage'));
const WmsOutboundPage = React.lazy(() => import('./pages/WmsOutboundPage'));
const WmsAlertPage = React.lazy(() => import('./pages/WmsAlertPage'));
const WmsReportPage = React.lazy(() => import('./pages/WmsReportPage'));
const WmsReplenishmentPage = React.lazy(() => import('./pages/WmsReplenishmentPage'));
const TransferPage = React.lazy(() => import('./pages/TransferPage'));
const ProjectDetailPage = React.lazy(() => import('./pages/ProjectDetailPage'));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'));
const PluginsPage = React.lazy(() => import('./pages/PluginsPage'));
const ApiDomainWhitelistPage = React.lazy(() => import('./pages/ApiDomainWhitelistPage'));
const ApiTemplatesPage = React.lazy(() => import('./pages/ApiTemplatesPage'));
const BrowserPage = React.lazy(() => import('./pages/BrowserPage'));
const ApiCredentialsPage = React.lazy(() => import('./pages/ApiCredentialsPage'));
const ApiHistoryPage = React.lazy(() => import('./pages/ApiHistoryPage'));

/** 强调色映射 */
const ACCENT_MAP: Record<AccentColor, { main: string; light: string }> = {
  default: { main: '#111827', light: '#374151' },
  blue:    { main: '#2563EB', light: '#60A5FA' },
  green:   { main: '#059669', light: '#34D399' },
  purple:  { main: '#7C3AED', light: '#A78BFA' },
  red:     { main: '#DC2626', light: '#F87171' },
  orange:  { main: '#EA580C', light: '#FB923C' },
};

/** 根据外观配置动态创建 MUI Theme — 仅支持 light/dark，使用统一灰阶 */
function buildTheme(appearance: AppearanceConfig) {
  const isDark = appearance.themeMode === 'dark';
  const gs = getGrayScale(isDark);
  const accent = ACCENT_MAP[appearance.accentColor] || ACCENT_MAP.default;
  const radiusMap = { sharp: 0, normal: 6, rounded: 12 } as const;
  const radius = radiusMap[appearance.borderRadius] ?? 6;

  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: { main: accent.main, light: accent.light, dark: accent.main },
      secondary: { main: gs.textMuted },
      background: {
        default: gs.bgPage,
        paper: gs.bgPanel,
      },
      text: {
        primary: gs.textPrimary,
        secondary: gs.textSecondary,
      },
      divider: gs.border,
    },
    typography: {
      fontFamily: [
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        '"Helvetica Neue"',
        'Arial',
        'sans-serif',
      ].join(','),
    },
    components: {
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: radius,
            border: `1px solid ${gs.border}`,
            backgroundColor: gs.bgPanel,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: radius,
            fontWeight: 500,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: radius },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontSize: '0.8rem',
            fontWeight: 600,
            color: gs.textMuted,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: { '&:last-child td': { borderBottom: 0 } },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            backgroundColor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              backgroundColor: gs.bgInput,
              borderRadius: radius,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& fieldset': {
              borderColor: gs.borderDarker,
            },
            '&:hover fieldset': {
              borderColor: isDark ? '#555555' : '#9CA3AF',
            },
            '&.Mui-focused fieldset': {
              borderColor: accent.main,
            },
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: gs.bgHover,
            },
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: {
            '& .MuiSwitch-track': {
              backgroundColor: gs.borderDarker,
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: gs.bgPanel,
            borderBottom: `1px solid ${gs.border}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: gs.bgSidebar,
            borderRight: `1px solid ${gs.border}`,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: gs.bgHover,
            },
            '&.Mui-selected': {
              backgroundColor: gs.bgActive,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: gs.bgPage,
            color: gs.textPrimary,
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: {
            backgroundColor: gs.bgInput,
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            backgroundColor: gs.bgInput,
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          paper: {
            backgroundColor: gs.bgPanel,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? '#2D2D2D' : '#374151',
            color: isDark ? '#F3F4F6' : '#FFFFFF',
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: gs.border,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: gs.textMuted,
            '&:hover': {
              backgroundColor: gs.bgHover,
            },
          },
        },
      },
      MuiTypography: {
        styleOverrides: {
          root: {
            color: gs.textPrimary,
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    },
  });
}

/** 自动隐藏滚动条 Hook：默认隐藏，滚动时显示，停止滚动 3 秒后隐藏；enabled=false 时完全禁用 */
function useAutoHideScrollbar(enabled: boolean = true) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return; // pywebview 环境下禁用
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      el.classList.add('scrollbar-visible');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        el.classList.remove('scrollbar-visible');
      }, 3000);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled]);

  return scrollRef;
}

/**
 * 全局刷新事件总线 — 顶部工具栏的「刷新表格」按钮派发事件，
 * 各页面组件订阅后自行刷新数据。
 */
type RefreshListener = () => void;
const refreshListeners = new Map<string, Set<RefreshListener>>();

export function subscribeRefresh(pageKey: string, listener: RefreshListener): () => void {
  if (!refreshListeners.has(pageKey)) refreshListeners.set(pageKey, new Set());
  refreshListeners.get(pageKey)!.add(listener);
  return () => { refreshListeners.get(pageKey)?.delete(listener); };
}

export function emitRefresh(pageKey: string) {
  refreshListeners.get(pageKey)?.forEach((fn) => fn());
}

/**
 * 全局新建仓库事件 — 顶部工具栏的「新建仓库」按钮派发事件，
 * WarehouseList 组件订阅后打开新建对话框。
 */
type NewWarehouseListener = () => void;
let newWarehouseListener: NewWarehouseListener | null = null;

export function subscribeNewWarehouse(listener: NewWarehouseListener): () => void {
  newWarehouseListener = listener;
  return () => { newWarehouseListener = null; };
}

export function emitNewWarehouse() {
  newWarehouseListener?.();
}

/**
 * 全局仓库切换事件总线 — 顶部工具栏的仓库切换按钮派发事件，
 * DashboardPage 订阅后更新 selectedWarehouse。
 */
type WarehouseChangeListener = (warehouseId: string) => void;
const warehouseChangeListeners = new Set<WarehouseChangeListener>();

export function subscribeWarehouseChange(listener: WarehouseChangeListener): () => void {
  warehouseChangeListeners.add(listener);
  return () => { warehouseChangeListeners.delete(listener); };
}

export function emitWarehouseChange(warehouseId: string) {
  warehouseChangeListeners.forEach((fn) => fn(warehouseId));
}

/** 根据当前路由决定顶部工具栏右侧显示哪些功能按钮 */
function getToolbarActions(pathname: string) {
  // 仓库管理页：刷新 + 新建仓库
  if (pathname.startsWith('/warehouses')) {
    return { refresh: true, newWarehouse: true, warehouseSwitch: false };
  }
  // 客商管理页：仅刷新
  if (pathname === '/partners') {
    return { refresh: true, newWarehouse: false, warehouseSwitch: false };
  }
  // 仪表盘：仅刷新（仓库切换由 DashboardPage 内部管理）
  if (pathname === '/dashboard') {
    return { refresh: true, newWarehouse: false, warehouseSwitch: false };
  }
  // 在途、库存、报表、WMS页面：仅刷新
  if (pathname.startsWith('/in-transit') || pathname.startsWith('/inventory') || pathname.startsWith('/reports') || pathname.startsWith('/wms/') || pathname.startsWith('/transfer')) {
    return { refresh: true, newWarehouse: false, warehouseSwitch: false };
  }
  // 其他页面（腾讯文档、设置）：无操作按钮
  return { refresh: false, newWarehouse: false, warehouseSwitch: false };
}

/** 获取当前页面刷新事件的 key */
function getPageRefreshKey(pathname: string): string {
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname.startsWith('/warehouses')) return 'warehouses';
  if (pathname === '/partners') return 'partners';
  if (pathname.startsWith('/in-transit')) return 'in-transit';
  if (pathname.startsWith('/inventory')) return 'inventory';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/wms/quality')) return 'wms-quality';
  if (pathname.startsWith('/wms/inventory')) return 'wms-inventory';
  if (pathname.startsWith('/wms/outbound')) return 'wms-outbound';
  if (pathname.startsWith('/wms/alerts')) return 'wms-alerts';
  if (pathname.startsWith('/wms/reports')) return 'wms-reports';
  if (pathname.startsWith('/wms/replenishment')) return 'wms-replenishment';
  if (pathname.startsWith('/transfer')) return 'transfer';
  return '';
}

/** 主布局（需要在 Router 内部以使用 useLocation / useNavigate） */
/** P0-1: localStorage 配额告警全局监听 — 必须在 ToastProvider 内部使用 */
const StorageWarningListener: React.FC = () => {
  const { showToast } = useToast();
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const keyLabel = detail?.key ? detail.key.replace('cdf-know-clow-', '') : '未知';
      showToast(`本地存储空间不足（${keyLabel}），部分数据可能无法保存。建议清理旧数据。`, 'warning', 8000);
    };
    window.addEventListener('cdf-know-clow-storage-warning', handler);
    return () => window.removeEventListener('cdf-know-clow-storage-warning', handler);
  }, [showToast]);
  return null;
};

const MainLayout: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('cdf-know-clow-sidebar-collapsed');
      // 第一次使用（无保存值）默认收起，之后尊重用户选择
      return saved === null ? true : saved === 'true';
    } catch { return true; }
  });
  // pywebview 检测 — frameless 模式下需要 --pw-top 避让红黄绿按钮
  // 红黄绿按钮下移5px + 右移5px + 额外5px内容间距，总避让高度 = 28(默认) + 5 + 5 = 38px
  const [isPy, setIsPy] = useState(() => isPyWebView());
  useEffect(() => {
    if (isPy) {
      // pywebview 环境立即注入 CSS 变量，避免布局闪烁
      document.documentElement.style.setProperty('--pw-top', '38px');
      // 红黄绿按钮偏移：通过 Cocoa API 移动（必须在窗口完全加载后调用）
      const applyTrafficLightOffset = async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const api = (window as any).pywebview?.api;
          if (api?.set_traffic_light_offset) {
            // 读取保存的偏移量（或使用默认值）
            const saved = await api.get_traffic_light_offset();
            const offset = typeof saved === 'string' ? JSON.parse(saved) : saved;
            if (offset?.ok !== false) {
              const x = offset?.offset_x ?? 5;
              const y = offset?.offset_y ?? 5;
              await api.set_traffic_light_offset(x, y);
            }
          }
        } catch { /* 非关键功能，静默失败 */ }
      };
      // 延迟 500ms 确保 NSWindow 完全初始化
      setTimeout(applyTrafficLightOffset, 500);

      // 窗口 resize 后重新应用红黄绿偏移（点击绿色 zoom 按钮后 macOS 会重置按钮位置）
      const reapplyOnResize = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = (window as any).pywebview?.api;
        if (api?.reapply_traffic_light_offset) {
          // 延迟 200ms 等待 macOS 完成窗口动画
          setTimeout(() => {
            api.reapply_traffic_light_offset().catch(() => {});
          }, 200);
        }
      };
      window.addEventListener('resize', reapplyOnResize);
      return () => {
        window.removeEventListener('resize', reapplyOnResize);
      };
    }
    const id = setInterval(() => {
      if (isPyWebView()) {
        setIsPy(true);
        document.documentElement.style.setProperty('--pw-top', '38px');
        clearInterval(id);
      }
    }, 100);
    setTimeout(() => clearInterval(id), 3000);
    return () => clearInterval(id);
  }, [isPy]);
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('cdf-know-clow-sidebar-collapsed', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // v1.5.73: settingsPopoverOpen 从 Sidebar 提升到 MainLayout，供 /settings 路由触发
  const [settingsPopoverOpen, setSettingsPopoverOpen] = useState(false);

  // /settings 路由：打开侧边栏设置弹窗并重定向到 /chat
  function SettingsRedirect() {
    const navigate = useNavigate();
    React.useEffect(() => {
      setSettingsPopoverOpen(true);
      navigate('/chat', { replace: true });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  // 自动隐藏滚动条：在 pywebview 环境下禁用（改用始终可见的宽滚动条）
  const scrollRef = useAutoHideScrollbar(!isPy);

  // AI 对话框可见性：自动化、Agent、技能、对话、项目页面隐藏
  // 在设置型页面中不显示 AI 对话框，避免混入 AI 浮层。
  const showChatBar = !location.pathname.startsWith('/automation') &&
    !location.pathname.startsWith('/skills') &&
    !location.pathname.startsWith('/chat') &&
    !location.pathname.startsWith('/projects');

  const actions = getToolbarActions(location.pathname);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const pageKey = getPageRefreshKey(location.pathname);

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(ALL_WAREHOUSES);
  const handleWarehouseChange = useCallback((warehouseId: string) => {
    setSelectedWarehouse(warehouseId);
    emitWarehouseChange(warehouseId);
  }, []);

  // 系统红黄绿按钮区域高度由 CSS 变量 --pw-top 控制（frameless 模式下 JS 注入 43px）
  // 两侧（Sidebar + 工具栏）均使用 calc(40px + var(--pw-top, 0px)) 统一高度

  return (
    <ToastProvider sidebarCollapsed={sidebarCollapsed}>
      <StorageWarningListener />
      {/* v1.5.64: 窗口拖拽条 — frameless pywebview 窗口移动入口 */}
      <WindowDragBar height={38} />
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        {/* Sidebar — 单栏布局 */}
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} settingsOpen={settingsPopoverOpen} onSettingsOpenChange={setSettingsPopoverOpen} />

      {/* Main content area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'background.paper',
          minHeight: '100vh',
          paddingTop: 'var(--pw-top, 0px)',
          position: 'relative',
          // v2.3.0: 内容区排除拖拽，允许文本选择/复制
          WebkitAppRegion: 'no-drag',
        }}
      >
        {/* 顶部操作按钮区 — 绝对定位在右上角，不占用垂直空间 */}
        {actions.warehouseSwitch && (
          <Box
            sx={{
              position: 'absolute',
              top: `calc(var(--pw-top, 0px) + 8px)`,
              right: 16,
              zIndex: 10,
            }}
          >
            <WarehouseSelector selected={selectedWarehouse} onChange={handleWarehouseChange} />
          </Box>
        )}

        {/* 主内容区：高度由内容决定，不强制撑满视窗 */}
        <Box
          sx={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* 可滚动的内容区域 — min-height:100% 让内容少时撑满可视区域，内容多时自然扩展 */}
          <Box
            ref={scrollRef}
            sx={{
              minHeight: '100%',
              overflowY: 'scroll',
              display: 'flex',
              flexDirection: 'column',
              // 滚动条默认隐藏，滚动时显示（通过 scrollbar-visible class）
              '&::-webkit-scrollbar': { width: '6px', height: '6px' },
              '&::-webkit-scrollbar-track': { background: 'transparent' },
              '&::-webkit-scrollbar-thumb': {
                background: 'transparent',
                borderRadius: '3px',
              },
              '&.scrollbar-visible::-webkit-scrollbar-thumb': {
                background: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
              },
              '&.scrollbar-visible::-webkit-scrollbar-thumb:hover': {
                background: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
              },
            }}
          >
            <Box
              sx={{
                px: 3, // 与 logo 对齐，增加左右 padding
                pt: 1.75, // 顶部间距：10px 下移
                pb: 3,
                paddingBottom: showChatBar ? '120px' : 3, // 为底部固定的对话框留出空间
                '& .full-width-page': {
                  mx: -3, // 抵消 px: 3，让全宽组件保持全宽
                  mt: -0.5, // 抵消 pt: 0.5
                  mb: 3,
                },
              }}
            >
              <ErrorBoundary>
                <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/chat" replace />} />
                    <Route path="/projects" element={<ProjectsPage />} />
                    <Route path="/projects/:id" element={<ProjectDetailPage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/skills" element={<SkillsPage />} />
                    <Route path="/skills/:skillId" element={<SkillDetailPage />} />
                    <Route path="/skills/:skillId/audit" element={<SkillAuditPage />} />

                    <Route path="/chat" element={<ChatContainer variant="page" />} />
                    <Route path="/warehouses" element={<WarehousesPage />} />
                    <Route path="/warehouses/:warehouseId" element={<WarehousesPage />} />
                    <Route path="/partners" element={<PartnersPage />} />
                    <Route path="/in-transit" element={<InTransitPage />} />
                    <Route path="/inventory" element={<InventoryPage />} />
                    <Route path="/tencent-docs" element={<TencentDocsPage />} />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/wms/quality" element={<WmsQualityPage />} />
                    <Route path="/wms/inventory" element={<WmsInventoryPage />} />
                    <Route path="/wms/outbound" element={<WmsOutboundPage />} />
                    <Route path="/wms/alerts" element={<WmsAlertPage />} />
                    <Route path="/wms/reports" element={<WmsReportPage />} />
                    <Route path="/wms/replenishment" element={<Suspense fallback={<LoadingFallback />}><WmsReplenishmentPage /></Suspense>} />
                    <Route path="/transfer" element={<TransferPage />} />
                    <Route path="/settings" element={<SettingsRedirect />} />
                    <Route path="/automation" element={<AutomationPage />} />
                    <Route path="/plugins" element={<PluginsPage />} />
                    <Route path="/api-domain-whitelist" element={<ApiDomainWhitelistPage />} />
                    <Route path="/api-templates" element={<ApiTemplatesPage />} />
                    <Route path="/browser" element={<BrowserPage />} />
                    <Route path="/api-credentials" element={<ApiCredentialsPage />} />
                    <Route path="/api-history" element={<ApiHistoryPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* AI 对话框 — 固定在页面中下方，自动化/Agent/技能页面隐藏 */}
      {showChatBar && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 20,
            left: sidebarCollapsed ? '104px' : '304px',
            right: 32,
            zIndex: 1200,
            filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.12))',
          }}
        >
          <ChatContainer variant="embedded" />
        </Box>
      )}

      {/* 自动更新通知 — 左下角 */}
      <UpdateNotification />
    </Box>
  </ToastProvider>
);
};

/** 动态主题桥接组件：读取 settings → 构建 theme → 注入 ThemeProvider */
const ThemedApp: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useAppSettings();

  const theme = useMemo(
    () => buildTheme(settings.appearance),
    [settings.appearance],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

const App: React.FC = () => {
  useEffect(() => {
    automationEngine.start();
    return () => automationEngine.stop();
  }, []);

  return (
    <ErrorBoundary>
      <AppSettingsProvider>
        <ModelsProvider>
          <ChatProvider defaultModel="auto">
            <ToolPermissionProvider>
              <ThemedApp>
                <HashRouter>
                  <UpdateProvider>
                    <MainLayout />
                  </UpdateProvider>
                </HashRouter>
              </ThemedApp>
            </ToolPermissionProvider>
          </ChatProvider>
        </ModelsProvider>
      </AppSettingsProvider>
    </ErrorBoundary>
  );
};

export default App;
