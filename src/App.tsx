import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box, IconButton, Snackbar, Alert, useMediaQuery } from '@mui/material';
import MenuOpenOutlinedIcon from '@mui/icons-material/MenuOpenOutlined';
import Sidebar, { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED } from './components/Layout/Sidebar';
import WarehouseSelector, { ALL_WAREHOUSES } from './components/Dashboard/WarehouseSelector';
import { AppSettingsProvider, useAppSettings } from './contexts/AppSettingsContext';
import type { AppearanceConfig, AccentColor } from './contexts/AppSettingsContext';
import { isPyWebView } from './services/tencentDocsApi';
import { UpdateProvider } from './contexts/UpdateContext';
import UpdateNotification from './components/UpdateNotification';
import { CrossWmsChat } from './components/CrossWmsChat';
import ErrorBoundary from './components/Common/ErrorBoundary';
import { automationEngine } from './services/automationEngine';

// 从统一配色文件导入
export { PRIMARY, SECONDARY, BORDER, BG_LIGHT, BG_PAGE, WHITE, RADIUS, CHAT_COLORS } from './constants/theme';

// 静态导入 — file:// 协议下 WKWebView 不支持动态 import()
// Vite 构建时 inlineDynamicImports 已将全部代码打包到单文件，无需代码分割
import DashboardPage from './pages/DashboardPage';
import SkillsPage from './pages/SkillsPage';
import SkillDetailPage from './pages/SkillDetailPage';
import AgentPage from './pages/AgentPage';
import ChatPage from './pages/ChatPage';
import WarehousesPage from './pages/WarehousesPage';
import InTransitPage from './pages/InTransitPage';
import InventoryPage from './pages/InventoryPage';
import TencentDocsPage from './pages/TencentDocsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import AutomationPage from './pages/AutomationPage';
import TasksPage from './pages/TasksPage';
import NotFoundPage from './pages/NotFoundPage';

/** 强调色映射 */
const ACCENT_MAP: Record<AccentColor, { main: string; light: string }> = {
  default: { main: '#111827', light: '#374151' },
  blue:    { main: '#2563EB', light: '#60A5FA' },
  green:   { main: '#059669', light: '#34D399' },
  purple:  { main: '#7C3AED', light: '#A78BFA' },
  red:     { main: '#DC2626', light: '#F87171' },
  orange:  { main: '#EA580C', light: '#FB923C' },
};

/** 根据外观配置动态创建 MUI Theme */
function buildTheme(appearance: AppearanceConfig, prefersDark: boolean) {
  const isDark = appearance.themeMode === 'dark' || (appearance.themeMode === 'system' && prefersDark);
  const accent = ACCENT_MAP[appearance.accentColor] || ACCENT_MAP.default;
  const radiusMap = { sharp: 0, normal: 6, rounded: 12 } as const;
  const radius = radiusMap[appearance.borderRadius] ?? 6;

  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: { main: accent.main, light: accent.light, dark: accent.main },
      secondary: { main: '#6B7280' },
      background: {
        default: isDark ? '#111111' : '#F8F8F8',
        paper: isDark ? '#1E1E1E' : '#FFFFFF',
      },
      text: {
        primary: isDark ? '#F3F4F6' : '#111827',
        secondary: isDark ? '#9CA3AF' : '#6B7280',
      },
      divider: isDark ? '#2D2D2D' : '#E5E7EB',
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
            border: `1px solid ${isDark ? '#2D2D2D' : '#E5E7EB'}`,
            backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
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
            color: isDark ? '#9CA3AF' : '#6B7280',
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
            backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              backgroundColor: isDark ? '#2D2D2D' : '#FFFFFF',
            },
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
  // 仪表盘：仅刷新（仓库切换由 DashboardPage 内部管理）
  if (pathname === '/dashboard') {
    return { refresh: true, newWarehouse: false, warehouseSwitch: false };
  }
  // 在途、库存、报表：仅刷新
  if (pathname.startsWith('/in-transit') || pathname.startsWith('/inventory') || pathname.startsWith('/reports')) {
    return { refresh: true, newWarehouse: false, warehouseSwitch: false };
  }
  // 其他页面（腾讯文档、设置）：无操作按钮
  return { refresh: false, newWarehouse: false, warehouseSwitch: false };
}

/** 获取当前页面刷新事件的 key */
function getPageRefreshKey(pathname: string): string {
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname.startsWith('/warehouses')) return 'warehouses';
  if (pathname.startsWith('/in-transit')) return 'in-transit';
  if (pathname.startsWith('/inventory')) return 'inventory';
  if (pathname.startsWith('/reports')) return 'reports';
  return '';
}

/** 主布局（需要在 Router 内部以使用 useLocation / useNavigate） */
const MainLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('crosswms-sidebar-collapsed') === 'true';
    } catch { return false; }
  });
  // pywebview 检测 — frameless 模式下需要 --pw-top 避让红黄绿按钮
  // 红黄绿按钮下移5px + 右移5px，总避让高度 = 28(默认) + 5 = 33px
  const [isPy, setIsPy] = useState(() => isPyWebView());
  useEffect(() => {
    if (isPy) {
      // pywebview 环境立即注入 CSS 变量，避免布局闪烁
      document.documentElement.style.setProperty('--pw-top', '33px');
      // 红黄绿按钮偏移：通过 Cocoa API 移动（必须在窗口完全加载后调用）
      const applyTrafficLightOffset = async () => {
        try {
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
        document.documentElement.style.setProperty('--pw-top', '33px');
        clearInterval(id);
      }
    }, 100);
    setTimeout(() => clearInterval(id), 3000);
    return () => clearInterval(id);
  }, [isPy]);
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('crosswms-sidebar-collapsed', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // 自动隐藏滚动条：在 pywebview 环境下禁用（改用始终可见的宽滚动条）
  const scrollRef = useAutoHideScrollbar(!isPy);

  // AI 对话框可见性：自动化、Agent、技能、任务/对话页面隐藏（ChatPage 自带输入框）
  const showChatBar = !location.pathname.startsWith('/automation') && !location.pathname.startsWith('/agent') && !location.pathname.startsWith('/skills') && !location.pathname.startsWith('/chat');

  const actions = getToolbarActions(location.pathname);
  const pageKey = getPageRefreshKey(location.pathname);

  const handleRefresh = useCallback(() => {
    if (pageKey) emitRefresh(pageKey);
  }, [pageKey]);

  const handleNewWarehouse = useCallback(() => {
    emitNewWarehouse();
  }, []);

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(ALL_WAREHOUSES);
  const handleWarehouseChange = useCallback((warehouseId: string) => {
    setSelectedWarehouse(warehouseId);
    emitWarehouseChange(warehouseId);
  }, []);

  // 启动自动化执行引擎
  useEffect(() => {
    automationEngine.start();
    return () => {
      automationEngine.stop();
    };
  }, []);

  // P0-1: localStorage 配额告警全局监听
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const keyLabel = detail?.key ? detail.key.replace('crosswms-', '') : '未知';
      setStorageWarning(`本地存储空间不足（${keyLabel}），部分数据可能无法保存。建议清理旧数据。`);
    };
    window.addEventListener('crosswms-storage-warning', handler);
    return () => window.removeEventListener('crosswms-storage-warning', handler);
  }, []);

  // 系统红黄绿按钮区域高度由 CSS 变量 --pw-top 控制（frameless 模式下 JS 注入 33px）
  // 两侧（Sidebar + 工具栏）均使用 calc(40px + var(--pw-top, 0px)) 统一高度
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar — 单栏布局 */}
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

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
            className={isPy ? undefined : "auto-hide-scrollbar"}
            sx={{
              minHeight: '100%',
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
              // pywebview 环境：始终显示宽滚动条，提升拖动体验
              ...(isPy ? {
                '&::-webkit-scrollbar': { width: '10px', height: '10px' },
                '&::-webkit-scrollbar-track': { background: '#F3F4F6' },
                '&::-webkit-scrollbar-thumb': {
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: '5px',
                  '&:hover': { background: 'rgba(0,0,0,0.45)' },
                },
              } : {
                // 浏览器环境：默认隐藏滚动条，滚动时显示
                '&::-webkit-scrollbar': { width: '6px' },
                '&::-webkit-scrollbar-track': { background: 'transparent' },
                '&::-webkit-scrollbar-thumb': {
                  background: 'transparent',
                  borderRadius: '3px',
                  transition: 'background-color 0.3s ease',
                },
                '&:hover::-webkit-scrollbar-thumb': {
                  background: 'rgba(0,0,0,0.15)',
                },
                '&.scrollbar-visible::-webkit-scrollbar-thumb': {
                  background: 'rgba(0,0,0,0.2)',
                  '&:hover': { background: 'rgba(0,0,0,0.35)' },
                },
              }),
            }}
          >
            <Box
              sx={{
                px: 3, // 与 logo 对齐，增加左右 padding
                pt: 0.5, // 极小顶部间距，与 logo 区域顶部对齐
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
                <Routes>
                  <Route path="/" element={<Navigate to="/chat" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/skills" element={<SkillsPage />} />
                  <Route path="/skills/:skillId" element={<SkillDetailPage />} />
                  <Route path="/agent" element={<AgentPage />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/warehouses" element={<WarehousesPage />} />
                  <Route path="/warehouses/:warehouseId" element={<WarehousesPage />} />
                  <Route path="/in-transit" element={<InTransitPage />} />
                  <Route path="/inventory" element={<InventoryPage />} />
                  <Route path="/tencent-docs" element={<TencentDocsPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/automation" element={<AutomationPage />} />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
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
          <CrossWmsChat />
        </Box>
      )}

      {/* 自动更新通知 — 左下角 */}
      <UpdateNotification />

      {/* P0-1: localStorage 配额告警 Snackbar */}
      <Snackbar
        open={Boolean(storageWarning)}
        autoHideDuration={8000}
        onClose={() => setStorageWarning(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity="warning"
          variant="filled"
          onClose={() => setStorageWarning(null)}
          sx={{ width: '100%', maxWidth: 480 }}
        >
          {storageWarning}
        </Alert>
      </Snackbar>
    </Box>
  );
};

/** 动态主题桥接组件：读取 settings → 构建 theme → 注入 ThemeProvider */
const ThemedApp: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useAppSettings();
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  const theme = useMemo(
    () => buildTheme(settings.appearance, prefersDark),
    [settings.appearance, prefersDark],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

const App: React.FC = () => {
  return (
    <AppSettingsProvider>
      <ThemedApp>
        <HashRouter>
          <UpdateProvider>
            <MainLayout />
          </UpdateProvider>
        </HashRouter>
      </ThemedApp>
    </AppSettingsProvider>
  );
};

export default App;
