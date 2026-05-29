import React, { useState, useCallback, useRef, useEffect } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box, IconButton, Button, Tooltip, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import Sidebar, { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED } from './components/Layout/Sidebar';
import WarehouseSelector, { ALL_WAREHOUSES } from './components/Dashboard/WarehouseSelector';
import { AppSettingsProvider } from './contexts/AppSettingsContext';
import { isPyWebView } from './services/tencentDocsApi';
import { AIAssistantProvider, AIAssistantFab, AIAssistantPanel } from './components/AIAssistant/AIAssistantPanel';
import { UpdateProvider } from './contexts/UpdateContext';
import UpdateNotification from './components/UpdateNotification';
import ErrorBoundary from './components/Common/ErrorBoundary';

// 静态导入 — file:// 协议下 WKWebView 不支持动态 import()
// Vite 构建时 inlineDynamicImports 已将全部代码打包到单文件，无需代码分割
import DashboardPage from './pages/DashboardPage';
import WarehousesPage from './pages/WarehousesPage';
import InTransitPage from './pages/InTransitPage';
import InventoryPage from './pages/InventoryPage';
import TencentDocsPage from './pages/TencentDocsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';

/** Global MUI Theme */
const theme = createTheme({
  palette: {
    primary: {
      main: '#000000',
      light: '#374151',
      dark: '#000000',
    },
    secondary: {
      main: '#6B7280',
    },
    background: {
      default: '#F8F8F8',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#111827',
      secondary: '#6B7280',
    },
    divider: '#E5E7EB',
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
          borderRadius: 8,
          border: '1px solid #E5E7EB',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 6,
          fontWeight: 500,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontSize: '0.8rem',
          fontWeight: 600,
          color: '#6B7280',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-child td': {
            borderBottom: 0,
          },
        },
      },
    },
  },
});

/** 自动隐藏滚动条 Hook：默认隐藏，滚动时显示，停止滚动 3 秒后隐藏 */
function useAutoHideScrollbar() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
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
  }, []);

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
  // 仪表盘：仓库切换 + 刷新
  if (pathname === '/') {
    return { refresh: true, newWarehouse: false, warehouseSwitch: true };
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
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/warehouses')) return 'warehouses';
  if (pathname.startsWith('/in-transit')) return 'in-transit';
  if (pathname.startsWith('/inventory')) return 'inventory';
  if (pathname.startsWith('/reports')) return 'reports';
  return '';
}

/** 主布局（需要在 Router 内部以使用 useLocation / useNavigate） */
const MainLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // pywebview 检测 — pywebview_app.py 在 HTML 中注入 --pw-top: 28px，
  // 这里的 isPy 状态用于非布局场景（API / AI 助手连接等）
  const [isPy, setIsPy] = useState(() => isPyWebView());
  useEffect(() => {
    if (isPy) return;
    const id = setInterval(() => {
      if (isPyWebView()) {
        setIsPy(true);
        clearInterval(id);
      }
    }, 100);
    setTimeout(() => clearInterval(id), 3000);
    return () => clearInterval(id);
  }, [isPy]);
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  // 自动隐藏滚动条：滚动时显示，停止 3 秒后隐藏
  const scrollRef = useAutoHideScrollbar();

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

  // 系统红黄绿按钮区域高度由 index.html 内联脚本通过 CSS 变量 --pwtl-h 控制
  // 两侧（Sidebar + 工具栏）均使用 calc(40px + var(--pwtl-h, 0px)) 统一高度
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar — 单栏布局 */}
      <Sidebar collapsed={sidebarCollapsed} />

      {/* Main content area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#FFFFFF',
          minHeight: '100vh',
          overflow: 'hidden',
        }}
      >
        {/* 顶部工具栏 — 左侧收起按钮，右侧功能按钮，与系统红黄绿平行 */}
        <Box
          className="no-drag"
          sx={{
            display: 'flex',
            alignItems: 'flex-end',  // 内容贴底部对齐（红绿灯在上方）
            justifyContent: 'space-between',
            px: 1,
            // 与 Sidebar 统一使用 index.html 内联脚本设置的 CSS 变量 --pw-top
            height: 'calc(40px + var(--pw-top, 0px))',
            pb: '4px',
            flexShrink: 0,
          }}
        >
          {/* 左侧：收起/展开侧边栏按钮 */}
          <IconButton
            onClick={toggleSidebar}
            size="small"
            sx={{
              color: '#6B7280',
              borderRadius: '6px',
              '&:hover': { backgroundColor: 'rgba(0,0,0,0.06)' },
            }}
          >
            {sidebarCollapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
          </IconButton>

          {/* 右侧：功能按钮 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {actions.warehouseSwitch && (
              <WarehouseSelector selected={selectedWarehouse} onChange={handleWarehouseChange} />
            )}
            {actions.refresh && (
              <Tooltip title="刷新数据" arrow>
                <IconButton
                  onClick={handleRefresh}
                  size="small"
                  sx={{
                    color: '#6B7280',
                    borderRadius: '6px',
                    '&:hover': { backgroundColor: 'rgba(0,0,0,0.06)' },
                  }}
                >
                  <RefreshOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {actions.newWarehouse && (
              <Button
                variant="contained"
                startIcon={<AddOutlinedIcon />}
                onClick={handleNewWarehouse}
                sx={{
                  backgroundColor: '#111827',
                  color: '#FFFFFF',
                  fontSize: '0.8125rem',
                  px: 2,
                  py: 0.5,
                  boxShadow: 'none',
                  '&:hover': {
                    backgroundColor: '#374151',
                    boxShadow: 'none',
                  },
                }}
              >
                新建仓库
              </Button>
            )}
          </Box>
        </Box>

        {/* 可滚动的内容区域 — 滚动条默认隐藏，滚动时显示，停止后隐藏 */}
        <Box
          ref={scrollRef}
          className="auto-hide-scrollbar"
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            // 默认隐藏滚动条
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
            // 滚动时通过 class 显示滚动条
            '&.scrollbar-visible::-webkit-scrollbar-thumb': {
              background: 'rgba(0,0,0,0.2)',
              '&:hover': { background: 'rgba(0,0,0,0.35)' },
            },
          }}
        >
          <Box
            sx={{
              p: 3,
              '& .full-width-page': {
                m: -3,
              },
            }}
          >
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/warehouses" element={<WarehousesPage />} />
                <Route path="/warehouses/:warehouseId" element={<WarehousesPage />} />
                <Route path="/in-transit" element={<InTransitPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/tencent-docs" element={<TencentDocsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </ErrorBoundary>
          </Box>
        </Box>
      </Box>

      {/* AI 助手浮动组件 */}
      <AIAssistantFab />
      <AIAssistantPanel />

      {/* 自动更新通知 — 左下角 */}
      <UpdateNotification />
    </Box>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <HashRouter>
        <AppSettingsProvider>
          <UpdateProvider>
            <AIAssistantProvider>
              <MainLayout />
            </AIAssistantProvider>
          </UpdateProvider>
        </AppSettingsProvider>
      </HashRouter>
    </ThemeProvider>
  );
};

export default App;
